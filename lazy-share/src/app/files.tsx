import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Paths, Directory } from 'expo-file-system';
import { Link } from 'expo-router';

export default function FilesScreen() {
  const [files, setFiles] = useState<any[]>([]);

  useEffect(() => {
    loadFiles();
  }, []);

  const loadFiles = async () => {
    try {
      const dir = new Directory(Paths.document);
      const contents = await dir.list();
      setFiles(contents);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Shared Files</Text>
      <FlatList
        data={files}
        keyExtractor={item => item.name}
        renderItem={({ item }) => (
          <View style={styles.fileItem}>
            <Text style={styles.fileName}>{item.name}</Text>
            <Text style={styles.fileType}>{item.isDirectory ? 'Folder' : 'File'}</Text>
          </View>
        )}
        ListEmptyComponent={<Text>No files received yet.</Text>}
      />
      <Link href="/" style={styles.backButton}>
        <Text style={styles.backText}>Back to Home</Text>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  fileItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
  fileName: { fontSize: 16 },
  fileType: { fontSize: 12, color: '#666', marginTop: 5 },
  backButton: { marginTop: 20, padding: 15, backgroundColor: '#208AEF', borderRadius: 8, alignItems: 'center' },
  backText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});
