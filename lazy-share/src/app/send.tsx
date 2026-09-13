import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList, Platform } from 'react-native';
import Zeroconf from 'react-native-zeroconf';
import TcpSocket from 'react-native-tcp-socket';
import { File } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { Buffer } from 'buffer';
import { BleManager } from 'react-native-ble-plx';

export default function SendScreen() {
  const [status, setStatus] = useState('Scanning...');
  const [logs, setLogs] = useState<string[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [progress, setProgress] = useState(0);
  const [distance, setDistance] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  
  const distanceRef = useRef<number | null>(null);
  const isPausedRef = useRef(false);
  
  // Track devices for distance calculation
  const deviceRssiMap = useRef<Record<string, { rssi: number, lastSeen: number }>>({});
  const targetBleDeviceId = useRef<string | null>(null);
  const scanStartTime = useRef<number>(0);
  const bleManagerRef = useRef<BleManager | null>(null);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, msg]);
  };

  useEffect(() => {
    const zeroconf = new Zeroconf();
    bleManagerRef.current = new BleManager();
    
    zeroconf.on('resolved', (service) => {
      addLog(`Found service: ${service.name}`);
      setDevices(prev => {
        if (!prev.find(d => d.name === service.name)) {
          return [...prev, service];
        }
        return prev;
      });
    });

    zeroconf.on('remove', (name) => {
      setDevices(prev => prev.filter(d => d.name !== name));
    });

    zeroconf.on('error', (err) => {
      addLog(`Zeroconf error: ${err.message}`);
    });

    zeroconf.scan('lazyshare', 'tcp', 'local.');
    addLog('Started scanning for services...');

    return () => {
      zeroconf.stop();
      if (bleManagerRef.current) {
        bleManagerRef.current.stopDeviceScan();
        bleManagerRef.current.destroy();
      }
    };
  }, []);

  const startBleScan = async () => {
    if (Platform.OS === 'web' || !bleManagerRef.current) return;
    
    addLog('Initializing BLE Manager to track distance...');
    try {
      const state = await bleManagerRef.current.state();
      addLog(`BLE State: ${state}`);
      
      if (state === 'PoweredOn') {
        scanStartTime.current = Date.now();
        targetBleDeviceId.current = null;
        deviceRssiMap.current = {};
        
        addLog('BLE is PoweredOn. Starting device scan to lock onto receiver...');
        bleManagerRef.current.startDeviceScan(null, { allowDuplicates: true }, (error, device) => {
          if (error) {
             // Only log once to avoid spam
             return;
          }
          if (device && device.rssi) {
            const now = Date.now();
            const timeSinceStart = now - scanStartTime.current;
            const rssiSmoothingAlpha = 0.4;
            
            // Locking phase: first 3 seconds we figure out the strongest device
            if (!targetBleDeviceId.current) {
              if (!deviceRssiMap.current[device.id]) {
                deviceRssiMap.current[device.id] = { rssi: device.rssi, lastSeen: now };
              } else {
                deviceRssiMap.current[device.id].rssi = 
                  rssiSmoothingAlpha * device.rssi + 
                  (1 - rssiSmoothingAlpha) * deviceRssiMap.current[device.id].rssi;
                deviceRssiMap.current[device.id].lastSeen = now;
              }
              
              if (timeSinceStart > 1500) {
                // Lock onto the device with the highest smoothed RSSI
                let maxRssi = -1000;
                let bestDevice = null;
                for (const id in deviceRssiMap.current) {
                  if (deviceRssiMap.current[id].rssi > maxRssi) {
                    maxRssi = deviceRssiMap.current[id].rssi;
                    bestDevice = id;
                  }
                }
                if (bestDevice) {
                  targetBleDeviceId.current = bestDevice;
                  addLog(`Locked onto receiver BLE device (${bestDevice}) with RSSI ${maxRssi.toFixed(1)}`);
                  // Clear map to only track this device going forward
                  deviceRssiMap.current = { [bestDevice]: deviceRssiMap.current[bestDevice] };
                } else {
                  // Fallback: reset timer to keep looking
                  scanStartTime.current = Date.now();
                }
              }
            } else if (device.id === targetBleDeviceId.current) {
              // Tracking phase: only care about the locked device
              if (deviceRssiMap.current[device.id]) {
                 deviceRssiMap.current[device.id].rssi = 
                   rssiSmoothingAlpha * device.rssi + 
                   (1 - rssiSmoothingAlpha) * deviceRssiMap.current[device.id].rssi;
                 deviceRssiMap.current[device.id].lastSeen = now;
              }

              const trackedRssi = deviceRssiMap.current[device.id].rssi;
              const measuredPower = -69;
              const n = 2.5; 
              const calculatedDistance = Math.pow(10, (measuredPower - trackedRssi) / (10 * n));
              
              setDistance(calculatedDistance);
              distanceRef.current = calculatedDistance;
              
              let shouldPause = isPausedRef.current;
              if (calculatedDistance <= 1) {
                 shouldPause = true;
              } else {
                shouldPause = false
              }

              if (shouldPause !== isPausedRef.current) {
                 isPausedRef.current = shouldPause;
                 setIsPaused(shouldPause);
              }
            }
          }
        });
      } else {
        addLog(`BLE is not powered on (State: ${state}). Please enable Bluetooth.`);
      }
    } catch (e: any) {
      addLog(`BLE Init Error: ${e.message}`);
    }
  };

  const sendFile = async (device: any) => {
    try {
      const result = await DocumentPicker.getDocumentAsync();
      if (result.canceled) return;

      const selected = result.assets[0];
      const file = new File(selected.uri);
      
      const host = device.addresses[0];
      const port = device.port;

      setStatus(`Connecting to ${device.name}...`);
      const client = TcpSocket.createConnection({ host, port }, async () => {
        addLog('Connected to receiver.');
        
        // ** NEW LOGIC: Start BLE Scan only after connecting to the server **
        startBleScan();

        setStatus('Handshaking...');
        
        const handshake = {
          type: 'handshake',
          deviceName: 'SenderDevice',
          fileName: selected.name,
          fileSize: selected.size,
          mimeType: selected.mimeType,
          checksum: 'skip_for_now'
        };
        
        client.write(JSON.stringify(handshake) + '\n');
      });
      
      let state = 'waiting_accept';

      client.on('data', async (data) => {
        const msgStr = data.toString();
        const msgs = msgStr.split('\n').filter(Boolean);
        
        for (const msg of msgs) {
          const parsed = JSON.parse(msg);
          if (state === 'waiting_accept' && parsed.type === 'accept') {
            state = 'sending';
            setStatus('Sending...');
            addLog('Handshake accepted. Streaming file...');
            
            try {
              const reader = file.readableStream().getReader();
              let bytesSent = 0;
              
              while (true) {
                while (isPausedRef.current) {
                   setStatus('Paused (Check Distance)');
                   await new Promise(r => setTimeout(r, 1000));
                }
                setStatus('Sending...');

                const { done, value } = await reader.read();
                if (done) {
                  addLog('Finished reading file. Sending EOF...');
                  const eof = Buffer.alloc(4);
                  eof.writeUInt32BE(0, 0);
                  client.write(eof);
                  break;
                }
                
                if (value) {
                  const chunkLen = Buffer.alloc(4);
                  chunkLen.writeUInt32BE(value.length, 0);
                  client.write(chunkLen);
                  client.write(Buffer.from(value));
                  
                  bytesSent += value.length;
                  setProgress(selected.size ? bytesSent / selected.size : 0);
                  await new Promise(r => setTimeout(r, 10)); // Allow pause loop to intercept
                }
              }
            } catch (err: any) {
              addLog(`Stream error: ${err.message}`);
              client.destroy();
            }
          } else if (parsed.type === 'complete') {
            setStatus('Transfer Complete!');
            addLog(`Transfer finished. Verified: ${parsed.verified}`);
            client.destroy();
            if (bleManagerRef.current) bleManagerRef.current.stopDeviceScan();
          }
        }
      });

      client.on('error', (err) => {
        addLog(`Socket error: ${err.message}`);
        setStatus('Error');
        if (bleManagerRef.current) bleManagerRef.current.stopDeviceScan();
      });

      client.on('close', () => {
        addLog('Connection closed.');
        if (bleManagerRef.current) bleManagerRef.current.stopDeviceScan();
      });

    } catch (e: any) {
      addLog(`Error: ${e.message}`);
      setStatus('Error');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Send</Text>
      <Text style={styles.status}>{status}</Text>
      <Text style={styles.progress}>{(progress * 100).toFixed(1)}%</Text>
      {distance !== null && (
        <Text style={[styles.status, isPaused ? {color: 'red'} : {color: 'green'}]}>
          {isPaused ? 'Too Close' : 'OK'}
        </Text>
      )}
      
      <View style={styles.listContainer}>
        <Text style={styles.subtitle}>Available Devices</Text>
        {devices.length === 0 ? (
          <Text style={styles.noneFound}>No devices found.</Text>
        ) : (
          <FlatList 
            data={devices}
            keyExtractor={d => d.name}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.deviceItem} onPress={() => sendFile(item)}>
                <Text style={styles.deviceName}>{item.name}</Text>
                <Text style={styles.deviceIp}>{item.addresses[0]}:{item.port}</Text>
              </TouchableOpacity>
            )}
          />
        )}
      </View>

      <ScrollView style={styles.logContainer}>
        {logs.map((log, i) => <Text key={i} style={styles.logText}>{log}</Text>)}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 10 },
  status: { fontSize: 16, marginBottom: 5 },
  progress: { fontSize: 20, fontWeight: 'bold', marginBottom: 10 },
  listContainer: { height: 200, marginBottom: 20, borderWidth: 1, borderColor: '#eee', borderRadius: 8, padding: 10 },
  subtitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
  noneFound: { fontStyle: 'italic', color: '#666' },
  deviceItem: { padding: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
  deviceName: { fontSize: 16 },
  deviceIp: { fontSize: 12, color: '#666' },
  logContainer: { flex: 1, backgroundColor: '#f0f0f0', padding: 10, borderRadius: 5 },
  logText: { fontSize: 12, fontFamily: 'monospace' },
});
