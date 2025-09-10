import { useEffect, useState } from "react";

// Replace with your Odds API key
const API_KEY = "c8b6bdc1a1ee7b6c3f9f4d15051634ac";
const SPORT_KEY = "americanfootball_nfl";

// Mock data for testing locally
const MOCK_GAMES = [
  {
    id: "g1",
    kickoff: new Date(Date.now() + 3600 * 1000).toISOString(),
    underdog: { team: "HOU Texans", opponent: "KC Chiefs", spread: 6.5 },
  },
  {
    id: "g2",
    kickoff: new Date(Date.now() + 7200 * 1000).toISOString(),
    underdog: { team: "CHI Bears", opponent: "GB Packers", spread: 2.5 },
  },
];

export function useNflGames() {
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

        // Map API response to your app format: only team names + spread + kickoff
        const formattedGames = data.map((g) => ({
          id: g.id,
          kickoff: g.commence_time,
          underdog: {
            team: g.sites[0].odds.spreads.underdog_team ?? g.home_team,
            opponent: g.sites[0].odds.spreads.favorite_team ?? g.away_team,
            spread: g.sites[0].odds.spreads.points ?? 0,
          },
        }));

        setGames(formattedGames.length ? formattedGames : MOCK_GAMES);
      } catch (err) {
        console.error("Failed to fetch NFL games:", err);
        setError(err);
        // Fallback to mock games
        setGames(MOCK_GAMES);
      } finally {
        setLoading(false);
      }
    }

    fetchGames();
  }, []);

  return { games, loading, error };
}
