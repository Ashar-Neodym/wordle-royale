import { authFixtures, settingsFixtures } from './auth.js';
import { gameplayFixtures } from './gameplay.js';
import { lobbyEnvelopes, lobbyFixtures } from './lobbies.js';
import { leaderboardFixtures, matchReportFixtures } from './reports.js';
import { statusFixtures } from './status.js';
import { fixtureUsers } from './users.js';

export const fixtureScenarios = {
  anonymousVisitor: { description: 'Anonymous visitor on landing/auth routes.', auth: authFixtures.anonymous },
  onboardingProfileIncomplete: { description: 'Authenticated user must choose handle/display name.', auth: authFixtures.profileIncomplete },
  onboardingConsentIncomplete: { description: 'Authenticated user must complete consent step.', auth: authFixtures.consentIncomplete, settings: settingsFixtures.consent },
  homeEmpty: { description: 'New player with no recent matches.', auth: authFixtures.complete, status: statusFixtures.emptyRecentMatches },
  publicLobbyList: { description: 'Open public/private lobby list for browser UI.', lobbies: lobbyEnvelopes.listOpen },
  publicLobbyEmpty: { description: 'No public lobbies available.', lobbies: lobbyEnvelopes.listEmpty, status: statusFixtures.emptyLobbies },
  privateLobbyWaiting: { description: 'Host waiting room with one not-ready player.', lobby: lobbyFixtures.privateWaiting },
  lobbyReadyToStart: { description: 'All players ready and host can start.', lobby: lobbyFixtures.publicReady },
  ratedPrivateDisabled: { description: 'V1 disabled rated private lobby path.', lobby: lobbyFixtures.ratedPrivateDisabled },
  lobbyJoinFullError: { description: 'Join race where lobby becomes full.', response: lobbyEnvelopes.joinFull },
  activeGameplay: { description: 'Active round with accepted feedback.', gameplay: gameplayFixtures.activeRound },
  invalidWordGameplay: { description: 'Rejected invalid word that does not consume attempt.', gameplay: gameplayFixtures.invalidWord },
  pendingSubmitGameplay: { description: 'Guess submitted and awaiting server confirmation.', gameplay: gameplayFixtures.pendingSubmit },
  solvedGameplay: { description: 'Solved player round and intermission UI.', gameplay: gameplayFixtures.solvedRound },
  failedGameplay: { description: 'Failed round after valid guesses consumed.', gameplay: gameplayFixtures.failedRound },
  timedOutGameplay: { description: 'Timed-out player state.', gameplay: gameplayFixtures.timedOut },
  reconnectingGameplay: { description: 'Active round while input should pause for reconnect.', gameplay: gameplayFixtures.reconnecting, status: statusFixtures.reconnecting },
  resyncingGameplay: { description: 'Post-reconnect state sync.', gameplay: gameplayFixtures.resyncing },
  rankedReportGain: { description: 'Ranked match report with MMR gain.', report: matchReportFixtures.rankedGain },
  rankedReportLoss: { description: 'Ranked match report with MMR loss.', report: matchReportFixtures.rankedLoss },
  casualReport: { description: 'Casual spoiler-safe match report without MMR.', report: matchReportFixtures.casual },
  emptyLeaderboard: { description: 'Leaderboard empty state.', leaderboard: leaderboardFixtures.empty },
  populatedLeaderboard: { description: 'Leaderboard including provisional user row.', leaderboard: leaderboardFixtures.populated },
  accessibilityModes: { description: 'Colorblind and reduced-motion settings enabled.', user: fixtureUsers.ashar, settings: settingsFixtures.colorblindReducedMotion },
} as const;

export type FixtureScenarioName = keyof typeof fixtureScenarios;
