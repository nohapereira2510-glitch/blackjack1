# Blackjack

A browser Blackjack game powered by the free [Deck of Cards API](https://deckofcardsapi.com/).
Plain HTML/CSS/JavaScript: no build step, no dependencies.

## Rules
- 6-deck shoe, reshuffled when 75% of it has been dealt
- Blackjack pays 3:2
- Dealer peeks for blackjack and stands on all 17s
- Double down on any two cards; split once (split aces get one card each)
- Your bankroll ($1,000 to start) is saved in the browser

Keyboard: `H` hit, `S` stand, `D` double, `P` split, `Enter` deal.

## Sign in with Google
Players sign in with Google through Supabase Auth (`auth.js`) before they can play. Once signed in, the header greets them by first name and shows their Google profile picture.

Supabase setup (Dashboard → Authentication):
- **Sign In / Providers → Google**: enabled, with the Google OAuth client ID and secret. In Google Cloud, the OAuth client's authorized redirect URI is `https://yptcidtlziiumivuzoei.supabase.co/auth/v1/callback`.
- **URL Configuration**: set **Site URL** to the Netlify URL and add it to **Redirect URLs** (plus `http://localhost:8000` for local testing). Otherwise Supabase sends players back to the wrong page after Google sign-in.

## How it uses the API
| Action | Endpoint |
| --- | --- |
| Open a shuffled shoe | `GET /api/deck/new/shuffle/?deck_count=6` |
| Deal / hit | `GET /api/deck/<deck_id>/draw/?count=N` |
| Reshuffle the shoe | `GET /api/deck/<deck_id>/shuffle/` |
| Card images | `card.image` from the draw response, `static/img/back.png` for the hole card |

## Run locally
Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

## Deploy to Netlify
Connect this repo (or drag the folder into Netlify Drop). `netlify.toml` publishes the repo root with no build command.
