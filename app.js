// Blackjack powered by the Deck of Cards API (https://deckofcardsapi.com/)
(() => {
  "use strict";

  const API = "https://deckofcardsapi.com/api/deck";
  const CARD_BACK = "https://deckofcardsapi.com/static/img/back.png";
  const DECK_COUNT = 6;
  const SHOE_SIZE = 52 * DECK_COUNT;
  const RESHUFFLE_AT = Math.floor(SHOE_SIZE * 0.25); // reshuffle when 75% of the shoe is used
  const STARTING_BANKROLL = 1000;
  const DEAL_DELAY = 350;
  const STORAGE_KEY = "blackjack.bankroll";

  // ---------- State ----------
  const state = {
    deckId: null,
    remaining: 0,
    bankroll: loadBankroll(),
    pendingBet: 0,
    lastBet: 0,
    hands: [],        // { cards, bet, done, doubled, fromSplit, result }
    activeIndex: 0,
    dealer: [],
    holeHidden: true,
    phase: "betting", // betting | dealing | player | dealer | settled
    busy: false,
  };

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const el = {
    bankroll: $("bankroll"),
    bet: $("bet"),
    shoe: $("shoe"),
    message: $("message"),
    dealerCards: $("dealer-cards"),
    dealerTotal: $("dealer-total"),
    playerHands: $("player-hands"),
    bettingControls: $("betting-controls"),
    playControls: $("play-controls"),
    brokeControls: $("broke-controls"),
    deal: $("deal-btn"),
    clear: $("clear-btn"),
    rebet: $("rebet-btn"),
    hit: $("hit-btn"),
    stand: $("stand-btn"),
    double: $("double-btn"),
    split: $("split-btn"),
    reset: $("reset-btn"),
    retryControls: $("retry-controls"),
    retry: $("retry-btn"),
    chips: document.querySelectorAll("[data-chip]"),
  };

  // ---------- Helpers ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const money = (n) => "$" + n.toLocaleString("en-US");

  function loadBankroll() {
    try {
      const v = parseInt(localStorage.getItem(STORAGE_KEY), 10);
      return Number.isFinite(v) && v > 0 ? v : STARTING_BANKROLL;
    } catch {
      return STARTING_BANKROLL;
    }
  }

  function saveBankroll() {
    try { localStorage.setItem(STORAGE_KEY, String(state.bankroll)); } catch { /* ignore */ }
  }

  function cardValue(card) {
    if (card.value === "ACE") return 11;
    if (["KING", "QUEEN", "JACK"].includes(card.value)) return 10;
    return parseInt(card.value, 10);
  }

  function handTotal(cards) {
    let total = 0;
    let aces = 0;
    for (const c of cards) {
      total += cardValue(c);
      if (c.value === "ACE") aces++;
    }
    while (total > 21 && aces > 0) {
      total -= 10;
      aces--;
    }
    return { total, soft: aces > 0 };
  }

  const isBlackjack = (hand) => hand.cards.length === 2 && !hand.fromSplit && handTotal(hand.cards).total === 21;

  function formatTotal(cards) {
    const { total, soft } = handTotal(cards);
    return soft && total < 21 ? `${total - 10} / ${total}` : String(total);
  }

  // ---------- API ----------
  async function api(path) {
    const res = await fetch(`${API}/${path}`);
    if (!res.ok) throw new Error(`Deck API error (${res.status})`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Deck API request failed");
    return data;
  }

  async function newShoe() {
    const data = await api(`new/shuffle/?deck_count=${DECK_COUNT}`);
    state.deckId = data.deck_id;
    state.remaining = data.remaining;
  }

  async function reshuffle() {
    const data = await api(`${state.deckId}/shuffle/`);
    state.remaining = data.remaining;
  }

  async function ensureShoe() {
    if (!state.deckId) {
      await newShoe();
    } else if (state.remaining < RESHUFFLE_AT) {
      setMessage("Shuffling the shoe…");
      try {
        await reshuffle();
      } catch {
        await newShoe(); // deck may have expired on the server
      }
      await sleep(500);
    }
  }

  async function draw(count = 1) {
    let data;
    try {
      data = await api(`${state.deckId}/draw/?count=${count}`);
    } catch (err) {
      // Deck expired or exhausted: open a fresh shoe and try once more.
      await newShoe();
      data = await api(`${state.deckId}/draw/?count=${count}`);
    }
    if (data.cards.length < count) {
      await reshuffle();
      return draw(count);
    }
    state.remaining = data.remaining;
    await Promise.all(data.cards.map((c) => preload(c.image)));
    return data.cards;
  }

  function preload(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = img.onerror = resolve;
      img.src = src;
    });
  }

  // ---------- Rendering ----------
  function setMessage(text, tone = "") {
    el.message.textContent = text;
    el.message.className = "message" + (tone ? " " + tone : "");
  }

  function cardImg(card, hidden = false) {
    const img = document.createElement("img");
    img.className = "card";
    img.src = hidden ? CARD_BACK : card.image;
    img.alt = hidden ? "Face-down card" : `${card.value} of ${card.suit}`.toLowerCase();
    img.draggable = false;
    return img;
  }

  function renderDealer() {
    el.dealerCards.replaceChildren(
      ...state.dealer.map((c, i) => cardImg(c, i === 1 && state.holeHidden))
    );
    if (state.dealer.length === 0) {
      el.dealerTotal.hidden = true;
    } else {
      el.dealerTotal.hidden = false;
      el.dealerTotal.textContent = state.holeHidden
        ? formatTotal([state.dealer[0]])
        : formatTotal(state.dealer);
    }
  }

  const RESULT_LABELS = { win: "Win", lose: "Lose", push: "Push", bust: "Bust", blackjack: "Blackjack!" };

  function renderHands() {
    const nodes = state.hands.map((hand, i) => {
      const wrap = document.createElement("div");
      wrap.className = "hand";
      if (state.phase === "player" && i === state.activeIndex && state.hands.length > 1) {
        wrap.classList.add("active");
      }

      const cards = document.createElement("div");
      cards.className = "cards";
      cards.append(...hand.cards.map((c) => cardImg(c)));

      const info = document.createElement("div");
      info.className = "hand-info";
      const total = document.createElement("span");
      total.className = "total";
      total.textContent = formatTotal(hand.cards);
      const bet = document.createElement("span");
      bet.className = "hand-bet";
      bet.textContent = money(hand.bet) + (hand.doubled ? " (2x)" : "");
      info.append(total, bet);
      if (hand.result) {
        const r = document.createElement("span");
        r.className = `hand-result ${hand.result}`;
        r.textContent = RESULT_LABELS[hand.result];
        info.append(r);
      }

      wrap.append(cards, info);
      return wrap;
    });
    el.playerHands.replaceChildren(...nodes);
  }

  function renderStats() {
    el.bankroll.textContent = money(state.bankroll);
    const atStake = state.phase === "betting"
      ? state.pendingBet
      : state.hands.reduce((s, h) => s + h.bet, 0);
    el.bet.textContent = money(atStake);
    el.shoe.textContent = state.deckId ? `${state.remaining} cards` : "–";
  }

  function renderControls() {
    const betting = state.phase === "betting" || state.phase === "settled";
    const broke = betting && state.bankroll + state.pendingBet < 5;

    el.bettingControls.hidden = !betting || broke;
    el.playControls.hidden = state.phase !== "player";
    el.brokeControls.hidden = !broke;
    // The dealer phase only persists while idle if the API failed mid-turn.
    el.retryControls.hidden = !(state.phase === "dealer" && !state.busy);

    const lock = state.busy;
    el.chips.forEach((chip) => {
      chip.disabled = lock || Number(chip.dataset.chip) > state.bankroll;
    });
    el.deal.disabled = lock || state.pendingBet <= 0;
    el.clear.disabled = lock || state.pendingBet <= 0;
    el.rebet.disabled = lock || state.lastBet <= 0 || state.lastBet > state.bankroll + state.pendingBet
      || state.pendingBet === state.lastBet;

    if (state.phase === "player") {
      const hand = state.hands[state.activeIndex];
      const canAfford = state.bankroll >= hand.bet;
      el.hit.disabled = lock;
      el.stand.disabled = lock;
      el.double.disabled = lock || hand.cards.length !== 2 || !canAfford;
      el.split.disabled = lock || !canSplit(hand) || !canAfford;
    }
  }

  function render() {
    renderDealer();
    renderHands();
    renderStats();
    renderControls();
  }

  function canSplit(hand) {
    return state.hands.length === 1
      && hand.cards.length === 2
      && cardValue(hand.cards[0]) === cardValue(hand.cards[1]);
  }

  // Run an async action with controls locked; surface API errors to the player.
  async function run(action) {
    if (state.busy) return;
    state.busy = true;
    renderControls();
    try {
      await action();
    } catch (err) {
      console.error(err);
      setMessage(`Couldn't reach the card dealer: ${err.message}. Try again.`, "lose");
    } finally {
      state.busy = false;
      render();
    }
  }

  // ---------- Betting ----------
  function addChip(amount) {
    if (state.phase === "settled") resetTable();
    if (amount > state.bankroll) return;
    state.bankroll -= amount;
    state.pendingBet += amount;
    setMessage("Press Deal when you're ready.");
    render();
  }

  function clearBet() {
    state.bankroll += state.pendingBet;
    state.pendingBet = 0;
    setMessage("Place your bet to start.");
    render();
  }

  function rebet() {
    if (state.phase === "settled") resetTable();
    state.bankroll += state.pendingBet;
    state.pendingBet = 0;
    if (state.lastBet > state.bankroll) return render();
    state.bankroll -= state.lastBet;
    state.pendingBet = state.lastBet;
    setMessage("Press Deal when you're ready.");
    render();
  }

  function resetTable() {
    state.hands = [];
    state.dealer = [];
    state.holeHidden = true;
    state.activeIndex = 0;
    state.phase = "betting";
  }

  // ---------- Round flow ----------
  async function deal() {
    if (state.pendingBet <= 0) return;
    const bet = state.pendingBet;
    resetTable();
    state.phase = "dealing";
    state.lastBet = bet;
    state.pendingBet = 0;
    state.hands = [{ cards: [], bet, done: false, doubled: false, fromSplit: false, result: null }];
    saveBankroll();
    render();

    try {
      await ensureShoe();
      setMessage("Dealing…");
      const cards = await draw(4);
      const hand = state.hands[0];
      // Deal alternately: player, dealer, player, dealer (hole card)
      for (let i = 0; i < 4; i++) {
        (i % 2 === 0 ? hand.cards : state.dealer).push(cards[i]);
        render();
        await sleep(DEAL_DELAY);
      }
    } catch (err) {
      // The deal never completed: put the bet back in front of the player.
      state.pendingBet = bet;
      resetTable();
      throw err;
    }

    // Dealer peeks for blackjack when showing an ace or ten-value card.
    const upValue = cardValue(state.dealer[0]);
    const dealerBJ = handTotal(state.dealer).total === 21;
    const playerBJ = isBlackjack(state.hands[0]);

    if ((upValue >= 10 && dealerBJ) || playerBJ) {
      state.holeHidden = false;
      render();
      await sleep(DEAL_DELAY);
      return settle();
    }

    state.phase = "player";
    promptPlayer();
  }

  function promptPlayer() {
    const hand = state.hands[state.activeIndex];
    const label = state.hands.length > 1 ? `Hand ${state.activeIndex + 1}: ` : "";
    setMessage(`${label}${handTotal(hand.cards).total}. Hit or stand?`);
  }

  async function hit() {
    const hand = state.hands[state.activeIndex];
    const [card] = await draw(1);
    hand.cards.push(card);
    render();
    await sleep(DEAL_DELAY / 2);
    const { total } = handTotal(hand.cards);
    if (total > 21) {
      hand.result = "bust";
      hand.done = true;
      setMessage("Bust!", "lose");
      render();
      await sleep(DEAL_DELAY * 2);
      await nextHand();
    } else if (total === 21) {
      hand.done = true;
      await nextHand();
    } else {
      promptPlayer();
    }
  }

  async function stand() {
    state.hands[state.activeIndex].done = true;
    await nextHand();
  }

  async function doubleDown() {
    const hand = state.hands[state.activeIndex];
    if (hand.cards.length !== 2 || state.bankroll < hand.bet) return;
    const [card] = await draw(1); // draw first so a network error can't charge twice
    state.bankroll -= hand.bet;
    hand.bet *= 2;
    hand.doubled = true;
    saveBankroll();
    hand.cards.push(card);
    hand.done = true;
    if (handTotal(hand.cards).total > 21) {
      hand.result = "bust";
      setMessage("Bust!", "lose");
    }
    render();
    await sleep(DEAL_DELAY * 2);
    await nextHand();
  }

  async function split() {
    const hand = state.hands[0];
    if (!canSplit(hand) || state.bankroll < hand.bet) return;
    const [c1, c2] = await draw(2); // draw first so a network error can't charge twice
    state.bankroll -= hand.bet;
    saveBankroll();
    const splitAces = hand.cards[0].value === "ACE";
    const second = { cards: [hand.cards.pop()], bet: hand.bet, done: false, doubled: false, fromSplit: true, result: null };
    hand.fromSplit = true;
    state.hands.push(second);
    render();
    await sleep(DEAL_DELAY);

    hand.cards.push(c1);
    render();
    await sleep(DEAL_DELAY);
    second.cards.push(c2);
    render();
    await sleep(DEAL_DELAY);

    if (splitAces) {
      // Split aces receive one card each and the hand ends.
      hand.done = second.done = true;
      state.activeIndex = state.hands.length;
      return dealerTurn();
    }

    state.activeIndex = 0;
    if (handTotal(hand.cards).total === 21) {
      hand.done = true;
      return nextHand();
    }
    promptPlayer();
  }

  async function nextHand() {
    state.activeIndex++;
    while (state.activeIndex < state.hands.length) {
      const hand = state.hands[state.activeIndex];
      if (!hand.done && handTotal(hand.cards).total < 21) {
        render();
        return promptPlayer();
      }
      hand.done = true;
      state.activeIndex++;
    }
    await dealerTurn();
  }

  async function dealerTurn() {
    state.phase = "dealer";
    state.holeHidden = false;
    setMessage("Dealer's turn…");
    render();
    await sleep(DEAL_DELAY * 1.5);

    const anyLive = state.hands.some((h) => h.result !== "bust");
    if (anyLive) {
      // Dealer stands on all 17s.
      while (handTotal(state.dealer).total < 17) {
        const [card] = await draw(1);
        state.dealer.push(card);
        render();
        await sleep(DEAL_DELAY * 1.5);
      }
    }
    settle();
  }

  function settle() {
    state.holeHidden = false;
    const dealerTotal = handTotal(state.dealer).total;
    const dealerBJ = state.dealer.length === 2 && dealerTotal === 21;
    let net = 0;

    for (const hand of state.hands) {
      const total = handTotal(hand.cards).total;
      let payout = 0;
      if (hand.result === "bust" || total > 21) {
        hand.result = "bust";
      } else if (isBlackjack(hand) && !dealerBJ) {
        hand.result = "blackjack";
        payout = hand.bet + Math.floor(hand.bet * 1.5);
      } else if (dealerBJ && !isBlackjack(hand)) {
        hand.result = "lose";
      } else if (dealerTotal > 21 || total > dealerTotal) {
        hand.result = "win";
        payout = hand.bet * 2;
      } else if (total === dealerTotal) {
        hand.result = "push";
        payout = hand.bet;
      } else {
        hand.result = "lose";
      }
      state.bankroll += payout;
      net += payout - hand.bet;
    }

    state.phase = "settled";
    saveBankroll();

    let text;
    if (state.hands.length === 1 && state.hands[0].result === "blackjack") text = "Blackjack!";
    else if (dealerBJ) text = "Dealer has blackjack.";
    else if (dealerTotal > 21 && state.hands.some((h) => h.result === "win")) text = "Dealer busts!";
    else text = `Dealer has ${dealerTotal}.`;

    if (net > 0) setMessage(`${text} You win ${money(net)}.`, "win");
    else if (net < 0) setMessage(`${text} You lose ${money(-net)}.`, "lose");
    else setMessage(`${text} Push.`, "push");

    render();
  }

  function resetBankroll() {
    state.bankroll = STARTING_BANKROLL;
    state.pendingBet = 0;
    state.lastBet = 0;
    resetTable();
    saveBankroll();
    setMessage("Fresh chips! Place your bet to start.");
    render();
  }

  // ---------- Wire up ----------
  el.chips.forEach((chip) => chip.addEventListener("click", () => addChip(Number(chip.dataset.chip))));
  el.clear.addEventListener("click", clearBet);
  el.rebet.addEventListener("click", rebet);
  el.deal.addEventListener("click", () => run(deal));
  el.hit.addEventListener("click", () => run(hit));
  el.stand.addEventListener("click", () => run(stand));
  el.double.addEventListener("click", () => run(doubleDown));
  el.split.addEventListener("click", () => run(split));
  el.reset.addEventListener("click", resetBankroll);
  el.retry.addEventListener("click", () => run(dealerTurn));

  document.addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea") || e.metaKey || e.ctrlKey) return;
    const key = e.key.toLowerCase();
    if (state.phase === "player") {
      if (key === "h") el.hit.click();
      else if (key === "s") el.stand.click();
      else if (key === "d") el.double.click();
      else if (key === "p") el.split.click();
    } else if (key === "enter" || key === " ") {
      if (!el.deal.disabled && !el.bettingControls.hidden) {
        e.preventDefault();
        el.deal.click();
      }
    }
  });

  // Warm up the shoe in the background so the first deal is quick.
  render();
  newShoe().then(render).catch(() => { /* will retry on first deal */ });
})();
