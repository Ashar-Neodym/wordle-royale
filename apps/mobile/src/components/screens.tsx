import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { gameplayFixtures, leaderboardFixtures, lobbyEnvelopes, lobbyFixtures, matchReportFixtures, statusFixtures } from '../lib/fixtures';
import {
  getMobileApiReadinessSnapshot,
  type MobileApiHealthPayload,
  type MobileApiReadinessSnapshot,
  type MobileLeaderboardEntry,
  type MobileLobbyPreview,
} from '../lib/api-client';
import { Avatar, Badge, Section, Tile, styles as shared } from './primitives';
import { connectionStates, lobbyStates, rank, score } from './tokens';
import { formatState, userById } from './data';

type SnapshotState = {
  snapshot: MobileApiReadinessSnapshot | null;
  error: string | null;
};

function useMobileSnapshot(): SnapshotState {
  const [snapshot, setSnapshot] = useState<MobileApiReadinessSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getMobileApiReadinessSnapshot()
      .then((result) => {
        if (!mounted) return;
        setSnapshot(result);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!mounted) return;
        setError(reason instanceof Error ? reason.message : String(reason));
      });

    return () => {
      mounted = false;
    };
  }, []);

  return { snapshot, error };
}

export function HomeDashboard() {
  const live = connectionStates.live;
  return (
    <Section eyebrow="Rated word games" title="Play Wordle Royale">
      <Text style={shared.body}>A calm mobile shell for rooms, ratings, and server-owned play. Live API data appears when reachable; fixtures stay clearly labeled.</Text>
      <View style={[shared.row, local.metrics]}>
        <Badge label={live.label} bg={live.bg} border={live.border} text={live.text} />
        <Badge label="read-only preview" bg="#2f3a29" border="#6f8c50" text="#e9f0de" />
      </View>
    </Section>
  );
}

function dependencyStatus(data: MobileApiHealthPayload | null, name: 'database' | 'redis'): string {
  const value = data?.dependencies?.[name];
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return value.status;
  return 'unknown';
}

export function ApiReadinessCard() {
  const { snapshot, error } = useMobileSnapshot();
  const healthStatus = snapshot?.health.data?.status ?? snapshot?.health.status ?? 'checking';
  const readinessStatus = snapshot?.readiness.data?.status ?? snapshot?.readiness.status ?? 'checking';
  const healthConnected = snapshot?.health.status === 'connected';
  const readyConnected = snapshot?.readiness.status === 'connected';
  const fallbackMode = !healthConnected || !readyConnected;
  const database = dependencyStatus(snapshot?.readiness.data ?? null, 'database');
  const redis = dependencyStatus(snapshot?.readiness.data ?? null, 'redis');
  const apiUrl = snapshot?.apiUrl ?? 'checking EXPO_PUBLIC_API_URL';
  const source = snapshot ? (snapshot.source === 'env' ? 'env' : 'default') : 'pending';
  const fallbackReason = error ?? snapshot?.readiness.error ?? snapshot?.health.error ?? 'Waiting for API readiness response.';

  return (
    <Section eyebrow="API" title={fallbackMode ? 'Fixture fallback active' : 'Server ready'}>
      <Text style={shared.body}>Checks health/readiness and keeps the phone read-only. Physical phones need a LAN URL, not localhost.</Text>
      <View style={[shared.row, local.metrics]}>
        <Badge label={`health: ${healthStatus}`} bg={healthConnected ? '#273c29' : '#4a3826'} border={healthConnected ? '#78a65d' : '#d7a85b'} text={healthConnected ? '#d8ecd0' : '#f0d4a1'} />
        <Badge label={`ready: ${readinessStatus}`} bg={readyConnected ? '#273c29' : '#4a3826'} border={readyConnected ? '#78a65d' : '#d7a85b'} text={readyConnected ? '#d8ecd0' : '#f0d4a1'} />
      </View>
      <View style={shared.card} accessibilityRole={fallbackMode ? 'alert' : undefined}>
        <Text style={local.cardTitle}>API base URL</Text>
        <Text style={local.mono}>{apiUrl}</Text>
        <Text style={shared.body}>Source: {source} · fixture/demo: {fallbackMode ? 'on' : 'off'}</Text>
        <Text style={shared.body}>DB: {database} · Redis: {redis}</Text>
        {fallbackMode ? <Text style={local.warningText}>Fallback reason: {fallbackReason}</Text> : null}
      </View>
    </Section>
  );
}

function LiveLobbyCard({ lobby }: { lobby: MobileLobbyPreview }) {
  const token = lobbyStates[(lobby.state in lobbyStates ? lobby.state : 'waiting') as keyof typeof lobbyStates];
  const memberCount = lobby.members?.length ?? 0;
  const maxPlayers = lobby.settings?.maxPlayers ?? 0;
  return (
    <View style={shared.card}>
      <View style={shared.between}>
        <Badge label={token.label} bg={token.bg} border={token.border} text={token.text} />
        <Text style={local.meta}>{lobby.rankedCompatible ? 'rated' : 'casual'}</Text>
      </View>
      <Text style={local.codeSmall}>{lobby.code}</Text>
      <Text style={shared.body}>{memberCount}/{maxPlayers || '?'} players · {lobby.settings?.roundsCount ?? '?'} round(s) · {lobby.settings?.roundTimeSeconds ?? '?'}s</Text>
    </View>
  );
}

function LeaderRow({ row }: { row: MobileLeaderboardEntry }) {
  const badge = row.provisional ? rank.color.provisional : rank.color.rated;
  return (
    <View style={[shared.card, shared.between]}>
      <View>
        <Text style={local.cardTitle}>#{row.rank} {row.displayName}</Text>
        <Text style={shared.body}>{row.handle ? `@${row.handle} · ` : ''}{row.rating} rating · {row.matchesPlayed} games</Text>
      </View>
      <Badge label={badge.label} bg={badge.bg} border={badge.border} text={badge.text} />
    </View>
  );
}

export function LivePreviewCard() {
  const { snapshot, error } = useMobileSnapshot();
  const liveLobbies = snapshot?.lobbies.status === 'connected' ? snapshot.lobbies.data?.items ?? [] : [];
  const liveRows = snapshot?.leaderboard.status === 'connected' ? snapshot.leaderboard.data?.entries ?? [] : [];
  const liveProfile = snapshot?.ratedProfile.status === 'connected' ? snapshot.ratedProfile.data : null;
  const hasLivePreview = liveLobbies.length > 0 || liveRows.length > 0 || Boolean(liveProfile);
  const fallbackReason = error ?? snapshot?.lobbies.error ?? snapshot?.leaderboard.error ?? snapshot?.ratedProfile.error ?? 'Waiting for live preview endpoints.';
  const fixtureRows = leaderboardFixtures.populated.slice(0, 3);

  return (
    <Section eyebrow={hasLivePreview ? 'Live preview' : 'Fixture preview'} title={hasLivePreview ? 'Rooms and ratings' : 'Demo rooms and ratings'}>
      <Text style={shared.body}>Read-only mobile preview. Joining, starting, guessing, and rating finalization stay off-device for this ticket.</Text>
      {!hasLivePreview ? <Text style={local.warningText}>Live preview fallback: {fallbackReason}</Text> : null}
      {liveProfile ? (
        <View style={shared.card}>
          <Text style={local.cardTitle}>{liveProfile.displayName}</Text>
          <Text style={shared.body}>@{liveProfile.handle} · {liveProfile.rating} rating · {liveProfile.matchesPlayed} games</Text>
        </View>
      ) : null}
      {(liveLobbies.length > 0 ? liveLobbies.slice(0, 3) : []).map((lobby) => <LiveLobbyCard key={lobby.id} lobby={lobby} />)}
      {(liveRows.length > 0 ? liveRows.slice(0, 3) : []).map((row) => <LeaderRow key={row.userId} row={row} />)}
      {!hasLivePreview ? fixtureRows.map((row) => {
        const user = userById(row.userId);
        return (
          <View key={row.userId} style={[shared.card, shared.between]}>
            <View style={shared.row}><Avatar name={user.displayName} color={user.avatarColor} /><Text style={local.cardTitle}>{user.displayName}</Text></View>
            <Text style={local.meta}>{row.rank ? `#${row.rank}` : 'Unranked'} · {row.rating}</Text>
          </View>
        );
      }) : null}
    </Section>
  );
}

export function StatusRail() {
  const reconnecting = connectionStates.reconnecting;
  const resyncing = connectionStates.resyncing;
  const error = lobbyEnvelopes.joinFull.error;
  return (
    <View style={local.statusRail}>
      <View style={local.statusCard}><Text style={local.spinner}>◌</Text><Text style={shared.body}>{statusFixtures.loading.label}</Text></View>
      <View style={local.statusCard}><Badge label={reconnecting.label} bg={reconnecting.bg} border={reconnecting.border} text={reconnecting.text} /></View>
      <View style={local.statusCard}><Badge label={resyncing.label} bg={resyncing.bg} border={resyncing.border} text={resyncing.text} /></View>
      <View style={local.statusCard} accessibilityRole="alert"><Text style={local.errorText}>{error?.code ?? 'ERROR'}: {error?.message ?? 'Something went wrong.'}</Text></View>
    </View>
  );
}

export function LobbyBrowser() {
  const lobbies = lobbyEnvelopes.listOpen.data ?? [];
  return (
    <Section eyebrow="Fixture rooms" title="Practice room list">
      <View style={shared.card}>
        <Text style={local.code}>GRID22</Text>
        <Pressable style={local.primaryButton}><Text style={local.primaryButtonText}>Find fixture match</Text></Pressable>
      </View>
      {lobbies.map((lobby) => {
        const token = lobbyStates[lobby.state];
        return (
          <View key={lobby.id} style={shared.card}>
            <View style={shared.between}>
              <Badge label={token.label} bg={token.bg} border={token.border} text={token.text} />
              <Text style={local.meta}>{lobby.visibility}</Text>
            </View>
            <Text style={local.cardTitle}>{lobby.code}</Text>
            <Text style={shared.body}>{lobby.members.length}/{lobby.maxPlayers} players · {lobby.roundsCount} rounds · {lobby.roundTimeSeconds}s</Text>
          </View>
        );
      })}
    </Section>
  );
}

export function WaitingRoom() {
  const lobby = lobbyFixtures.privateWaiting;
  const token = lobbyStates[lobby.state];
  return (
    <Section eyebrow="Waiting room" title={`Room ${lobby.code}`}>
      <View style={shared.between}>
        <Badge label={token.label} bg={token.bg} border={token.border} text={token.text} />
        <Text style={local.meta}>{formatState(lobby.disabledStartReason ?? 'ready')}</Text>
      </View>
      {lobby.members.map((member) => {
        const user = userById(member.userId);
        const readyToken = lobbyStates[member.ready ? 'ready' : 'waiting'];
        return (
          <View key={member.userId} style={[shared.card, shared.between]}>
            <View style={shared.row}>
              <Avatar name={user.displayName} color={user.avatarColor} />
              <View><Text style={local.cardTitle}>{user.displayName}</Text><Text style={local.meta}>{member.role} · {member.connected ? 'connected' : 'offline'}</Text></View>
            </View>
            <Badge label={readyToken.label} bg={readyToken.bg} border={readyToken.border} text={readyToken.text} />
          </View>
        );
      })}
    </Section>
  );
}

export function GameplayBoard() {
  const gameplay = gameplayFixtures.solvedRound;
  const localPlayer = gameplay.players.find((player) => player.userId === gameplay.localUserId) ?? gameplay.players[0];
  const keyboardRows = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
  return (
    <Section eyebrow="Board preview" title="Server-shaped board">
      <Text style={shared.body}>Accepted fixture feedback only. No answer validation, timer authority, or scoring authority runs on-device.</Text>
      <View style={local.board}>
        {localPlayer.guesses.map((guess, rowIndex) => (
          <View key={`${guess.guess}-${rowIndex}`} style={local.tileRow}>
            {guess.feedback.map((state, tileIndex) => <Tile key={`${guess.guess}-${tileIndex}`} letter={guess.guess[tileIndex] ?? ''} state={state} />)}
          </View>
        ))}
        {Array.from({ length: Math.max(0, gameplay.maxGuesses - localPlayer.guesses.length) }, (_, rowIndex) => (
          <View key={`empty-${rowIndex}`} style={local.tileRow}>{Array.from({ length: gameplay.wordLength }, (_, tileIndex) => <Tile key={tileIndex} letter="" state="empty" />)}</View>
        ))}
      </View>
      <View style={local.keyboard}>{keyboardRows.map((row) => <View key={row} style={local.keyRow}>{row.split('').map((key) => <Text key={key} style={local.key}>{key}</Text>)}</View>)}</View>
    </Section>
  );
}

export function MatchReport() {
  const report = matchReportFixtures.rankedGain;
  return (
    <Section eyebrow="Result preview" title="Spoiler-safe result">
      {report.participants.map((participant) => {
        const user = userById(participant.userId);
        const ratingAfter = 'ratingAfter' in participant ? participant.ratingAfter : undefined;
        const ratingBefore = 'ratingBefore' in participant ? participant.ratingBefore : undefined;
        const delta = (ratingAfter ?? 0) - (ratingBefore ?? 0);
        const token = delta > 0 ? score.delta.positive : delta < 0 ? score.delta.negative : score.delta.neutral;
        return (
          <View key={participant.userId} style={[shared.card, shared.between]}>
            <View style={shared.row}><Text style={local.placement}>#{participant.placement}</Text><View><Text style={local.cardTitle}>{user.displayName}</Text><Text style={shared.body}>{participant.totalScore} pts · spoiler-safe</Text></View></View>
            <Badge label={`${delta >= 0 ? '+' : ''}${delta} MMR`} bg={token.bg} border={token.text} text={token.text} />
          </View>
        );
      })}
    </Section>
  );
}

export function SettingsAccessibility() {
  const rows = leaderboardFixtures.populated;
  return (
    <Section eyebrow="Settings + ranks" title="Accessibility snapshot">
      <Text style={shared.body}>Colorblind markers, high-contrast borders, reduced-motion copy, and explicit MMR text are represented in shared tokens.</Text>
      <View style={shared.row}>
        <Badge label={rank.color.provisional.label} bg={rank.color.provisional.bg} border={rank.color.provisional.border} text={rank.color.provisional.text} />
        <Badge label="Reduced motion" bg="#2b302b" border="#8c877d" text="#eee7da" />
      </View>
      {rows.map((row) => {
        const user = userById(row.userId);
        return <View key={row.userId} style={[shared.card, shared.between]}><View style={shared.row}><Avatar name={user.displayName} color={user.avatarColor} /><Text style={local.cardTitle}>{user.displayName}</Text></View><Text style={local.meta}>{row.rank ? `#${row.rank}` : 'Unranked'} · {row.rating}</Text></View>;
      })}
    </Section>
  );
}

const local = StyleSheet.create({
  metrics: { marginTop: 12, flexWrap: 'wrap' },
  statusRail: { width: '100%', maxWidth: '100%', marginTop: 18, gap: 8 },
  statusCard: { width: '100%', maxWidth: '100%', padding: 12, borderRadius: 5, backgroundColor: '#262421', borderWidth: 1, borderColor: '#4b4740', overflow: 'hidden' },
  spinner: { color: '#9dbc7c', fontSize: 22, fontWeight: '900' },
  errorText: { color: '#d08b7f', fontWeight: '800', flexShrink: 1 },
  code: { color: '#9dbc7c', fontSize: 26, fontWeight: '900', textAlign: 'center', letterSpacing: 4, marginBottom: 12 },
  codeSmall: { color: '#eee7da', fontSize: 22, fontWeight: '800', letterSpacing: 3, marginTop: 10 },
  primaryButton: { minHeight: 42, borderRadius: 4, backgroundColor: '#4f6f37', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  primaryButtonText: { color: '#f5f5ef', fontWeight: '900', textAlign: 'center' },
  meta: { color: '#b9b3a8', fontSize: 12, textTransform: 'capitalize', flexShrink: 1 },
  mono: { width: '100%', color: '#eee7da', fontSize: 12, fontWeight: '800', flexShrink: 1 },
  warningText: { color: '#d7a85b', fontSize: 13, lineHeight: 19, marginTop: 8, flexShrink: 1 },
  cardTitle: { color: '#f1eee8', fontSize: 16, fontWeight: '900', flexShrink: 1 },
  board: { width: '100%', alignItems: 'center', gap: 6, marginTop: 16 },
  tileRow: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  keyboard: { width: '100%', gap: 6, marginTop: 16 },
  keyRow: { width: '100%', flexDirection: 'row', justifyContent: 'center', gap: 3 },
  key: { flex: 1, maxWidth: 30, minWidth: 0, paddingVertical: 8, borderRadius: 4, backgroundColor: '#4b4740', color: '#f1eee8', textAlign: 'center', fontSize: 12, fontWeight: '900', overflow: 'hidden' },
  placement: { color: '#f1eee8', backgroundColor: '#37342f', borderRadius: 4, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 6, fontWeight: '900' },
});
