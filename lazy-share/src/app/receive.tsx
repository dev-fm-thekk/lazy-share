import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Zeroconf from 'react-native-zeroconf';
import TcpSocket from 'react-native-tcp-socket';
import { File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { Buffer } from 'buffer';
import * as BlePeripheralManager from 'react-native-ble-peripheral-manager';

// Proper 128-bit UUID — '1234' is not a valid BLE service UUID and will be
// rejected (silently, on some platforms) by the peripheral stack.
const LAZYSHARE_BLE_SERVICE_UUID = '0000fee0-0000-1000-8000-00805f9b34fb';

export default function ReceiveScreen() {
  const [status, setStatus] = useState('Initializing...');
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, msg]);
  };

  useEffect(() => {
    const zeroconf = new Zeroconf();
    const instanceName = `LazyShare-${Math.floor(Math.random() * 1000)}`;

    let bleSub: any = null;
    const initBLE = async () => {
      try {
        const startAdvertising = async () => {
          BlePeripheralManager.setName('LazyShare_BLE');
          BlePeripheralManager.addService(LAZYSHARE_BLE_SERVICE_UUID, true);
          await BlePeripheralManager.startAdvertising({
            localName: 'LazyShare_BLE',
            serviceUUIDs: [LAZYSHARE_BLE_SERVICE_UUID],
          });
          addLog('Started BLE advertising for proximity detection');
        };

        const state = await BlePeripheralManager.getState();
        if (state === 5) {
          // PoweredOn
          await startAdvertising();
        } else {
          bleSub = BlePeripheralManager.onDidUpdateState(async (event: any) => {
            if (event.state === 5) {
              await startAdvertising();
            }
          });
        }
      } catch (err: any) {
        addLog(`BLE error: ${err.message}`);
      }
    };
    initBLE();

    const server = TcpSocket.createServer(socket => {
      addLog(`Client connected: ${socket.remoteAddress}`);

      let state: 'waiting_handshake' | 'receiving_file' | 'done' = 'waiting_handshake';
      let expectedFileSize = 0;
      let expectedChecksum = '';
      let bytesReceived = 0;
      let targetFile: File | null = null;
      let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;

      // controlBuffer accumulates raw bytes until we see a newline-terminated
      // JSON control message. chunkBuffer accumulates the length-prefixed
      // binary file stream. Both exist because a TCP 'data' event can split
      // a logical message across chunks, or merge several into one — the
      // original code assumed one message per event, which breaks under
      // real network conditions.
      let controlBuffer = Buffer.alloc(0);
      let chunkBuffer = Buffer.alloc(0);

      // Serialize async processing per socket so two overlapping 'data'
      // events can never interleave writes to the same file writer.
      let chain: Promise<void> = Promise.resolve();
      const enqueue = (fn: () => Promise<void>) => {
        chain = chain.then(fn).catch(err => {
          addLog(`Error: ${err.message}`);
          setStatus('Error');
          try {
            socket.destroy();
          } catch {}
        });
      };

      const cleanupPartialFile = () => {
        try {
          if (targetFile && targetFile.exists) targetFile.delete();
        } catch {}
      };

      const processChunks = async () => {
        while (chunkBuffer.length >= 4) {
          const chunkLength = chunkBuffer.readUInt32BE(0);

          if (chunkLength === 0) {
            // EOF marker
            chunkBuffer = chunkBuffer.slice(4);
            addLog('EOF received, verifying checksum...');

            if (writer) {
              await writer.close();
              writer = null;
            }

            // Actually verify, instead of the previous stub that always
            // reported verified = true regardless of the received checksum.
            let verified = false;
            let computedHex = '';
            try {
              if (targetFile) {
                const bytes = await targetFile.bytes();
                const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
                computedHex = Buffer.from(digest).toString('hex');
                verified = !!expectedChecksum && computedHex === expectedChecksum;
              }
            } catch (e: any) {
              addLog(`Checksum verification failed: ${e.message}`);
            }

            addLog(
              verified
                ? 'Checksum verified.'
                : `Checksum mismatch (expected ${expectedChecksum || '<none>'}, got ${computedHex}).`
            );

            if (!verified) cleanupPartialFile();

            socket.write(JSON.stringify({ type: 'complete', verified }) + '\n');
            socket.end();
            state = 'done';
            setStatus(verified ? 'Transfer complete (verified)' : 'Transfer failed checksum');
            return;
          }

          if (chunkBuffer.length < 4 + chunkLength) break; // wait for more data

          const chunkData = chunkBuffer.slice(4, 4 + chunkLength);
          chunkBuffer = chunkBuffer.slice(4 + chunkLength);

          if (writer) {
            await writer.write(new Uint8Array(chunkData));
          }
          bytesReceived += chunkLength;
          setProgress(expectedFileSize > 0 ? Math.min(1, bytesReceived / expectedFileSize) : 0);
        }
      };

      socket.on('data', (data: Buffer | string) => {
        enqueue(async () => {
          if (state === 'waiting_handshake') {
            let passData = data as Buffer;
            controlBuffer = Buffer.concat([controlBuffer, passData]);
            const idx = controlBuffer.indexOf(0x0a); // '\n'
            if (idx === -1) return; // handshake line not fully arrived yet

            const line = controlBuffer.slice(0, idx).toString('utf8');
            const rest = controlBuffer.slice(idx + 1);
            controlBuffer = Buffer.alloc(0);

            const handshake = JSON.parse(line);
            if (handshake.type !== 'handshake') return;

            expectedFileSize = handshake.fileSize ?? 0;
            expectedChecksum = handshake.checksum ?? '';

            targetFile = new File(Paths.document, handshake.fileName);
            if (targetFile.exists) targetFile.delete();
            targetFile.create();
            writer = targetFile.writableStream().getWriter();

            state = 'receiving_file';
            socket.write(JSON.stringify({ type: 'accept' }) + '\n');
            addLog(`Handshake accepted. Receiving ${handshake.fileName}`);

            // Any bytes that arrived after the handshake's newline in the
            // same packet are already file data — don't drop them.
            if (rest.length > 0) {
              chunkBuffer = Buffer.concat([chunkBuffer, rest]);
              await processChunks();
            }
          } else if (state === 'receiving_file') {
            let passData = data as Buffer;
            chunkBuffer = Buffer.concat([chunkBuffer, passData]);
            await processChunks();
          }
        });
      });

      socket.on('error', (err) => {
        addLog(`Socket error: ${err.message}`);
        setStatus('Error');
        if (state !== 'done') cleanupPartialFile();
      });

      socket.on('close', () => {
        addLog('Socket closed.');
        if (state !== 'done') cleanupPartialFile();
      });
    });

    // Let the OS pick a free port instead of a random guess that could
    // collide with something else already listening.
    server.listen(0, '0.0.0.0', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      addLog(`Server listening on port ${port}`);
      setStatus('Waiting for connections...');
      zeroconf.publishService('lazyshare', 'tcp', 'local.', instanceName, port, { v: '1' });
      addLog(`Published zeroconf service: ${instanceName}`);
    });

    return () => {
      zeroconf.unpublishService('lazyshare');
      server.close();
      if (bleSub) bleSub.remove();
      BlePeripheralManager.stopAdvertising();
      BlePeripheralManager.removeAllServices();
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Receive</Text>
      <Text style={styles.status}>{status}</Text>
      <Text style={styles.progress}>{(progress * 100).toFixed(1)}%</Text>
      <ScrollView style={styles.logContainer}>
        {logs.map((log, i) => <Text key={i} style={styles.logText}>{log}</Text>)}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 10 },
  status: { fontSize: 16, marginBottom: 10 },
  progress: { fontSize: 20, fontWeight: 'bold', marginBottom: 10 },
  logContainer: { flex: 1, backgroundColor: '#f0f0f0', padding: 10, borderRadius: 5 },
  logText: { fontSize: 12, fontFamily: 'monospace' },
});