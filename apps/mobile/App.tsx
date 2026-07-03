import { useState } from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ApiReadinessCard, GameplayBoard, HistoryPreview, HomeDashboard, LivePreviewCard, LobbyBrowser, MatchReport, ProfileSummary, RulesSummary, SettingsAccessibility, StatusRail, WaitingRoom } from './src/components/screens';

type PrimaryRoute = 'play' | 'lobbies' | 'ratings' | 'menu';
type MenuRoute = 'profile' | 'history' | 'rules' | 'settings' | 'server';

type NavItem<T extends string> = {
  key: T;
  label: string;
};

const primaryRoutes: Array<NavItem<PrimaryRoute>> = [
  { key: 'play', label: 'Play' },
  { key: 'lobbies', label: 'Lobbies' },
  { key: 'ratings', label: 'Ratings' },
  { key: 'menu', label: 'Menu' },
];

const menuRoutes: Array<NavItem<MenuRoute>> = [
  { key: 'profile', label: 'Profile' },
  { key: 'history', label: 'History' },
  { key: 'rules', label: 'Rules' },
  { key: 'settings', label: 'Settings' },
  { key: 'server', label: 'Server' },
];

function NavChip<T extends string>({ item, active, onPress }: { item: NavItem<T>; active: boolean; onPress: (key: T) => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={() => onPress(item.key)}
      style={[styles.navChip, active ? styles.navChipActive : null]}
    >
      <Text style={[styles.navChipText, active ? styles.navChipTextActive : null]}>{item.label}</Text>
    </Pressable>
  );
}

function MobileNav({ route, menuRoute, setRoute, setMenuRoute }: { route: PrimaryRoute; menuRoute: MenuRoute; setRoute: (route: PrimaryRoute) => void; setMenuRoute: (route: MenuRoute) => void }) {
  return (
    <View style={styles.navWrap}>
      <View style={styles.navRow} accessibilityRole="tablist">
        {primaryRoutes.map((item) => <NavChip key={item.key} item={item} active={route === item.key} onPress={setRoute} />)}
      </View>
      {route === 'menu' ? (
        <View style={styles.menuPanel}>
          <Text style={styles.menuLabel}>More sections</Text>
          <View style={styles.navRow} accessibilityRole="tablist">
            {menuRoutes.map((item) => <NavChip key={item.key} item={item} active={menuRoute === item.key} onPress={setMenuRoute} />)}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function ActiveRoute({ route, menuRoute }: { route: PrimaryRoute; menuRoute: MenuRoute }) {
  if (route === 'lobbies') {
    return (
      <>
        <ApiReadinessCard />
        <LivePreviewCard />
        <LobbyBrowser />
        <WaitingRoom />
      </>
    );
  }

  if (route === 'ratings') {
    return (
      <>
        <LivePreviewCard />
        <SettingsAccessibility />
      </>
    );
  }

  if (route === 'menu') {
    if (menuRoute === 'profile') return <ProfileSummary />;
    if (menuRoute === 'history') return <HistoryPreview />;
    if (menuRoute === 'rules') return <RulesSummary />;
    if (menuRoute === 'settings') return <SettingsAccessibility />;
    return <ApiReadinessCard />;
  }

  return (
    <>
      <HomeDashboard />
      <StatusRail />
      <GameplayBoard />
      <MatchReport />
    </>
  );
}

export default function App() {
  const [route, setRoute] = useState<PrimaryRoute>('play');
  const [menuRoute, setMenuRoute] = useState<MenuRoute>('profile');

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.brandRow}>
            <Text style={styles.logo}>wr</Text>
            <Text style={styles.brand}>Wordle Royale</Text>
          </View>
          <MobileNav route={route} menuRoute={menuRoute} setRoute={setRoute} setMenuRoute={setMenuRoute} />
          <ActiveRoute route={route} menuRoute={menuRoute} />
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#302e2c' },
  content: { width: '100%', paddingHorizontal: 12, paddingTop: 12, paddingBottom: 38 },
  brandRow: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' },
  logo: { width: 32, height: 32, borderRadius: 4, borderWidth: 1, borderColor: '#4b4740', color: '#b9b3a8', textAlign: 'center', lineHeight: 30, fontSize: 12, fontWeight: '800', overflow: 'hidden' },
  brand: { color: '#f1eee8', fontSize: 22, fontWeight: '800', flexShrink: 1 },
  navWrap: { width: '100%', maxWidth: '100%', gap: 8, marginBottom: 2 },
  navRow: { width: '100%', maxWidth: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  navChip: { minHeight: 36, flexGrow: 1, flexBasis: '22%', minWidth: 0, borderRadius: 4, borderWidth: 1, borderColor: '#4b4740', backgroundColor: '#262421', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 8 },
  navChipActive: { borderColor: '#8fb66d', backgroundColor: '#3b4631' },
  navChipText: { color: '#b9b3a8', fontSize: 13, fontWeight: '900', textAlign: 'center', flexShrink: 1 },
  navChipTextActive: { color: '#f1eee8' },
  menuPanel: { width: '100%', maxWidth: '100%', padding: 10, borderRadius: 5, borderWidth: 1, borderColor: '#4b4740', backgroundColor: '#262421', overflow: 'hidden' },
  menuLabel: { color: '#b9b3a8', fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
});
