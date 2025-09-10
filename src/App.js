import React, { useState, useEffect, useMemo } from "react";

// ----- API Hook -----
const API_KEY = "c8b6bdc1a1ee7b6c3f9f4d15051634ac"; // Replace with your Odds API key
const SPORT_KEY = "americanfootball_nfl";

function useNflGames() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchGames() {
      setLoading(true);
      try {
        const res = await fetch(
          `https://api.the-odds-api.com/v4/sports/${SPORT_KEY}/odds?regions=us&markets=spreads&oddsFormat=american&apiKey=${API_KEY}`
        );
        if (!res.ok) throw new Error(`API Error: ${res.status}`);
        const data = await res.json();

        const formatted = data.map((g) => {
          const spreadInfo = g.sites[0]?.odds?.spreads;
          // pick underdog based on which team has positive spread
          const underdogTeam =
            spreadInfo?.points && spreadInfo.points > 0 ? g.home_team : g.away_team;
          const favoriteTeam =
            underdogTeam === g.home_team ? g.away_team : g.home_team;
          const spread = spreadInfo?.points ?? 0;
          return {
            id: g.id,
            kickoff: g.commence_time,
            underdog: { team: underdogTeam, opponent: favoriteTeam, spread },
          };
        });

        setGames(formatted.length ? formatted : []);
      } catch (err) {
        console.error(err);
        setError(err);
        setGames([]); // fallback is empty; App will render mock
      } finally {
        setLoading(false);
      }
    }

    fetchGames();
  }, []);

  return { games, loading, error };
}

// ----- Local Storage Helpers -----
const STORAGE_KEY = "underdog-pool-state-v2";

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error(e);
    return null;
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error(e);
  }
}

// ----- Utility -----
function classNames(...xs) {
  return xs.filter(Boolean).join(" ");
}

function scorePick(game, pick, result) {
  if (!game || !pick || !result || !result.settled) return 0;
  const spread = game.underdog.spread;
  const u = result.underdogScore ?? 0;
  const f = result.favoriteScore ?? 0;
  if (Number.isNaN(u) || Number.isNaN(f)) return 0;
  if (u > f) return 1 + spread;
  if (u + spread === f) return 0.5;
  if (u + spread > f) return 1;
  return 0;
}

// ----- Main App -----
export default function App() {
  const { games: apiGames, loading: loadingGames } = useNflGames();

  const [state, setState] = useState(() => {
    const saved = loadState();
    return saved || {
      season: 2025,
      currentWeek: 1,
      players: [],
      picks: {},
      results: {},
      gamesByWeek: { 1: [] }, // start empty; will update after API
      me: null,
    };
  });

  useEffect(() => {
    if (apiGames.length) {
      setState((s) => ({
        ...s,
        gamesByWeek: { ...s.gamesByWeek, [s.currentWeek]: apiGames },
      }));
    }
  }, [apiGames]);

  useEffect(() => saveState(state), [state]);

  const me = state.players.find((p) => p.id === state.me) || null;
  const games = state.gamesByWeek[state.currentWeek] || [];

  function addPlayer(name) {
    const id = "p_" + Math.random().toString(36).slice(2, 9);
    setState((s) => ({ ...s, players: [...s.players, { id, name }], me: id }));
  }

  function signIn(id) {
    setState((s) => ({ ...s, me: id }));
  }

  function upsertPick(gameId, underdogTeam) {
    if (!me) return;
    const kickoff = new Date(games.find((g) => g.id === gameId)?.kickoff || 0).getTime();
    if (Date.now() >= kickoff) return alert("Kickoff reached – picks are locked.");

    setState((s) => {
      const userPicks = s.picks[me.id] ? { ...s.picks[me.id] } : {};
      userPicks[s.currentWeek] = { gameId, underdogTeam };
      return { ...s, picks: { ...s.picks, [me.id]: userPicks } };
    });
  }

  function enterResult(gameId, underdogScore, favoriteScore) {
    setState((s) => ({
      ...s,
      results: {
        ...s.results,
        [gameId]: {
          underdogScore: Number(underdogScore),
          favoriteScore: Number(favoriteScore),
          settled: true,
        },
      },
    }));
  }

  const leaderboard = useMemo(() => {
    return state.players
      .map((p) => {
        let total = 0,
          wins = 0,
          covers = 0;
        for (const [weekStr, pick] of Object.entries(state.picks[p.id] || {})) {
          const week = Number(weekStr);
          const game = (state.gamesByWeek[week] || []).find((g) => g.id === pick.gameId);
          const result = state.results[pick.gameId];
          total += scorePick(game, pick, result);
          if (result?.settled) {
            const u = result.underdogScore;
            const f = result.favoriteScore;
            if (u > f) wins += 1;
            else if (u + game.underdog.spread > f) covers += 1;
          }
        }
        return { playerId: p.id, name: p.name, points: total, wins, covers };
      })
      .sort((a, b) => b.points - a.points);
  }, [state]);

  if (loadingGames) return <div className="p-6 text-white">Loading NFL games…</div>;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <Header season={state.season} week={state.currentWeek} />
        <AuthPanel players={state.players} me={me} onAdd={addPlayer} onSignIn={signIn} />
        <div className="grid md:grid-cols-2 gap-6">
          <UnderdogList
            games={games}
            currentPick={me ? state.picks[me.id]?.[state.currentWeek] : null}
            onPick={(g) => upsertPick(g.id, g.underdog.team)}
          />
          <PicksBoard players={state.players} picks={state.picks} week={state.currentWeek} games={games} />
        </div>
        <ResultsEntry games={games} results={state.results} onEnter={enterResult} />
        <Leaderboard rows={leaderboard} />
      </div>
    </div>
  );
}

// ----- Components -----
function Header({ season, week }) {
  return (
    <div className="flex justify-between items-center mb-4">
      <h1 className="text-3xl font-bold tracking-tight">Underdog Pool</h1>
      <p className="text-zinc-400">NFL Season {season} • Week {week}</p>
    </div>
  );
}

function AuthPanel({ players, me, onAdd, onSignIn }) {
  const [name, setName] = useState("");
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 flex flex-col md:flex-row gap-4">
      <div className="flex-1 flex gap-2 items-end">
        <input
          className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500"
          onClick={() => name.trim() && (onAdd(name.trim()), setName(""))}
        >
          Add & Sign In
        </button>
      </div>
      <div className="flex-1 flex gap-2 items-center">
        <select
          className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2"
          value={me?.id || ""}
          onChange={(e) => onSignIn(e.target.value)}
        >
          <option value="" disabled>
            Select player…
          </option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {me && <span className="text-zinc-400">Signed in: {me.name}</span>}
      </div>
    </div>
  );
}

function UnderdogList({ games, currentPick, onPick }) {
  const now = Date.now();
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
      <h2 className="text-lg font-semibold mb-2">Pick an underdog</h2>
      <div className="space-y-3">
        {games.map((g) => {
          const kickoff = new Date(g.kickoff).getTime();
          const locked = now >= kickoff;
          const isMine = currentPick?.gameId === g.id;
          return (
            <div
              key={g.id}
              className={classNames(
                "rounded-xl border p-3",
                isMine ? "border-emerald-500 bg-emerald-950/20" : "border-zinc-800 bg-zinc-950"
              )}
            >
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-medium">
                    {g.underdog.team} +{g.underdog.spread}
                  </div>
                  <div className="text-sm text-zinc-400">vs {g.underdog.opponent}</div>
                  <div className="text-xs text-zinc-500">
                    Kickoff: {new Date(g.kickoff).toLocaleString()}
                  </div>
                </div>
                <button
                  disabled={locked}
                  className={classNames(
                    "px-4 py-2 rounded-lg text-sm font-medium",
                    locked ? "bg-zinc-800 text-zinc-500 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-500"
                  )}
                  onClick={() => onPick(g)}
                >
                  {isMine ? "Picked" : locked ? "Locked" : "Pick"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {currentPick && <div className="mt-3 text-emerald-300">Your pick: {currentPick.underdogTeam}</div>}
    </div>
  );
}

function PicksBoard({ players, picks, week, games }) {
  const gameLookup = Object.fromEntries(games.map((g) => [g.id, g]));
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 overflow-x-auto">
      <h2 className="text-lg font-semibold mb-2">Picks Board (Week {week})</h2>
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-zinc-400">
            <th>Player</th>
            <th>Underdog</th>
            <th>Spread</th>
            <th>Opponent</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => {
            const pick = picks[p.id]?.[week];
            const g = pick ? gameLookup[pick.gameId] : null;
            return (
              <tr key={p.id} className="border-t border-zinc-800">
                <td>{p.name}</td>
                <td>{pick ? g?.underdog.team : "—"}</td>
                <td>{pick ? `+${g?.underdog.spread}` : "—"}</td>
                <td>{pick ? g?.underdog.opponent : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ResultsEntry({ games, results, onEnter }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
      <h2 className="text-lg font-semibold mb-2">Enter Results</h2>
      {games.map((g) => {
        const r = results[g.id] || { underdogScore: "", favoriteScore: "", settled: false };
        return (
          <div key={g.id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 mb-2">
            <div className="font-medium mb-1">
              {g.underdog.team} (+{g.underdog.spread}) vs {g.underdog.opponent}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Underdog Score</label>
                <input
                  type="number"
                  defaultValue={r.underdogScore}
                  onBlur={(e) => onEnter(g.id, e.target.value || 0, r.favoriteScore || 0)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Favorite Score</label>
                <input
                  type="number"
                  defaultValue={r.favoriteScore}
                  onBlur={(e) => onEnter(g.id, r.underdogScore || 0, e.target.value || 0)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2"
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Leaderboard({ rows }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 overflow-x-auto">
      <h2 className="text-lg font-semibold mb-2">Leaderboard</h2>
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-zinc-400">
            <th>Rank</th>
            <th>Player</th>
            <th>Pts</th>
            <th>OU Wins</th>
            <th>Covers</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.playerId} className="border-t border-zinc-800">
              <td>{i + 1}</td>
              <td>{r.name}</td>
              <td>{Number(r.points.toFixed(2))}</td>
              <td>{r.wins}</td>
              <td>{r.covers}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
