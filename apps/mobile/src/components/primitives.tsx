import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { tileStates, type TileFeedbackState, markerByState } from './tokens';

export function Section({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.title}>{title}</Text>
      {children}
    </View>
  );
}

export function Badge({ label, bg, border, text }: { label: string; bg: string; border: string; text: string }) {
  return <Text style={[styles.badge, { backgroundColor: bg, borderColor: border, color: text }]}>{label}</Text>;
}

export function Tile({ letter, state }: { letter: string; state: TileFeedbackState }) {
  const token = tileStates[state];
  const marker = markerByState[state];
  return (
    <View accessible accessibilityLabel={`${letter || 'blank'}: ${token.label}`} style={[styles.tile, { backgroundColor: token.bg, borderColor: token.border }]}>
      <Text style={[styles.tileLetter, { color: token.text }]}>{letter}</Text>
      {marker ? <Text style={[styles.tileMarker, { color: token.text }]}>{marker}</Text> : null}
    </View>
  );
}

export function Avatar({ name, color }: { name: string; color: string }) {
  return <Text style={[styles.avatar, { backgroundColor: color }]}>{name.slice(0, 1)}</Text>;
}

export const styles = StyleSheet.create({
  section: { width: '100%', maxWidth: '100%', marginTop: 18, padding: 12, borderRadius: 5, backgroundColor: '#262421', borderWidth: 1, borderColor: '#4b4740', overflow: 'hidden' },
  eyebrow: { color: '#b9b3a8', fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6, flexShrink: 1 },
  title: { color: '#f1eee8', fontSize: 22, fontWeight: '800', marginBottom: 8, flexShrink: 1 },
  body: { color: '#b9b3a8', fontSize: 15, lineHeight: 22, flexShrink: 1 },
  row: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  between: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  card: { width: '100%', maxWidth: '100%', padding: 12, borderRadius: 5, backgroundColor: '#37342f', borderWidth: 1, borderColor: '#4b4740', marginTop: 10, overflow: 'hidden' },
  badge: { maxWidth: '100%', alignSelf: 'flex-start', borderWidth: 1, borderRadius: 3, paddingHorizontal: 8, paddingVertical: 4, fontSize: 12, fontWeight: '800', overflow: 'hidden', flexShrink: 1 },
  tile: { width: 44, height: 44, borderRadius: 2, borderWidth: 2, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  tileLetter: { fontSize: 21, fontWeight: '900' },
  tileMarker: { position: 'absolute', right: 4, bottom: 0, fontSize: 11, fontWeight: '900' },
  avatar: { width: 34, height: 34, borderRadius: 4, overflow: 'hidden', color: '#f1eee8', textAlign: 'center', lineHeight: 34, fontWeight: '900' },
});
