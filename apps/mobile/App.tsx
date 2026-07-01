import { ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ApiReadinessCard, GameplayBoard, HomeDashboard, LivePreviewCard, LobbyBrowser, MatchReport, SettingsAccessibility, StatusRail, WaitingRoom } from './src/components/screens';

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.brandRow}>
            <Text style={styles.logo}>wr</Text>
            <Text style={styles.brand}>Wordle Royale</Text>
          </View>
          <HomeDashboard />
          <ApiReadinessCard />
          <LivePreviewCard />
          <StatusRail />
          <LobbyBrowser />
          <WaitingRoom />
          <GameplayBoard />
          <MatchReport />
          <SettingsAccessibility />
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#302e2c' },
  content: { width: '100%', paddingHorizontal: 12, paddingTop: 12, paddingBottom: 38 },
  brandRow: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2, flexWrap: 'wrap' },
  logo: { width: 32, height: 32, borderRadius: 4, borderWidth: 1, borderColor: '#4b4740', color: '#b9b3a8', textAlign: 'center', lineHeight: 30, fontSize: 12, fontWeight: '800', overflow: 'hidden' },
  brand: { color: '#f1eee8', fontSize: 22, fontWeight: '800', flexShrink: 1 },
});
