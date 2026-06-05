export const GAME_KNOWLEDGE = {
  trivia: {
    general: [
      {
        q: 'What does GG mean?',
        a: 'Good Game! A sign of respect after a match. Originates from early gaming culture and now used in almost every competitive game.',
      },
      {
        q: 'What is a clutch?',
        a: "Winning a round when you're the last one alive against multiple enemies. One of the most satisfying plays in gaming!",
      },
      {
        q: 'What does OP mean?',
        a: 'Overpowered — when something in a game is too strong and needs the developers to "nerf" it.',
      },
      {
        q: 'What is the meta?',
        a: 'Most Effective Tactic Available — the current best strategy, character, or loadout that most competitive players use.',
      },
      {
        q: 'What is a nerf?',
        a: 'When game developers reduce the power of a character, weapon, or ability to make the game more balanced. The opposite is a "buff".',
      },
      {
        q: 'What is a buff?',
        a: 'When developers increase the power of something in a game to make it more viable. The opposite of a "nerf".',
      },
      {
        q: 'What is RNG?',
        a: 'Random Number Generator — the luck element in games that determines outcomes like loot drops, critical hits, and more.',
      },
      {
        q: 'What is APM?',
        a: 'Actions Per Minute — a measure of how fast a player can perform actions, common in RTS and strategy games.',
      },
      {
        q: 'What does ROFL mean?',
        a: 'Rolling On the Floor Laughing — used when something is hilarious, often seen in gaming chat and streams.',
      },
      {
        q: 'What is a killstreak?',
        a: 'Consecutive kills without dying. In many shooters, killstreaks unlock special abilities or bonus points.',
      },
    ],
    cards: [
      {
        q: 'What are legendary cards?',
        a: "The rarest tier in ProjectGG! Ultra low drop rates, high trade value, and often have unique effects that common cards don't have.",
      },
      {
        q: 'How do I get rare cards?',
        a: 'Open packs for a chance at rare cards, complete daily challenges for guaranteed rewards, or trade with other players in the community!',
      },
      {
        q: 'What makes a card valuable?',
        a: "Rarity, current demand, card condition, set age, and whether it's from a limited or promotional set. Condition matters a lot!",
      },
      {
        q: 'What is a foil card?',
        a: 'A special holographic version of any card. Same effects, but much more valuable due to the shiny visual appeal and lower supply.',
      },
      {
        q: 'What does NFT mean in card games?',
        a: 'Non-Fungible Token — a unique digital asset verified on blockchain. Some card games use NFTs for true ownership of digital cards.',
      },
      {
        q: 'What is a trade binder?',
        a: "A collection of cards you're willing to trade away. Most players organize by rarity to make trading easier.",
      },
      {
        q: 'How do I know if a trade is fair?',
        a: 'Check recent sale prices on marketplace forums, use card value trackers, and always get a second opinion from experienced traders.',
      },
      {
        q: 'What is a starter deck?',
        a: 'A pre-built deck designed for new players. Usually has basic strategies and common cards to help learn the game mechanics.',
      },
    ],
    gaming: [
      {
        q: 'What is latency in gaming?',
        a: "The delay between your action and the game's response. Measured in milliseconds (ms). Lower is better — anything under 50ms is great!",
      },
      {
        q: 'What is FPS?',
        a: 'Frames Per Second — how many images your GPU renders each second. Higher FPS means smoother gameplay. 60 FPS is the standard goal.',
      },
      {
        q: 'What is a roguelike game?',
        a: 'Games where each run generates new layouts, enemies, and items. You start over often but unlock permanent upgrades. Think Hades or Slay the Spire!',
      },
      {
        q: 'What does PvP mean?',
        a: 'Player versus Player — combat between real players, not AI. The most competitive and often frustrating game mode!',
      },
      {
        q: 'What does PvE mean?',
        a: 'Player versus Environment — combat against AI enemies, bots, or the game itself. Great for learning without pressure.',
      },
      {
        q: 'What is a speedrun?',
        a: 'Completing a game as fast as possible. Speedrunners find glitches, skip sections, and optimize every moment for the fastest time.',
      },
      {
        q: 'What is a co-op game?',
        a: 'Cooperative gameplay — you and other players work together against AI enemies. Great for playing with friends!',
      },
      {
        q: 'What is a BR game?',
        a: 'Battle Royale — a game mode where many players fight until one remains. Drop in, loot up, and be the last one standing!',
      },
    ],
  },
  tips: {
    trading: [
      'Always check the current market value before trading legendary or rare cards — prices fluctuate!',
      "Don't rush trades — take screenshots of the agreement as proof in case of disputes.",
      'Build a friends list of trusted traders. Repeat traders are usually more reliable.',
      'Know the difference between trade value and sell value. Sometimes selling directly gets you more than trading!',
      'Use the "48-hour rule" — if a deal seems too good to be true, wait and think it over before accepting.',
    ],
    gaming: [
      'Take breaks every hour! Extended gaming sessions lead to fatigue and worse performance.',
      'Communication is key in team games — call out enemy positions and coordinate strategies.',
      'Learn from your losses — every defeat teaches you something about your playstyle.',
      'Warm up before ranked matches. Even 10 minutes of practice can improve your performance.',
      'Find a gaming routine that works for you. Consistent play times help you track your improvement.',
    ],
  },
  jokes: [
    'Why did the gamer bring a ladder to LAN party? To get a higher K/D ratio!',
    'I only know 2 letters in gaming: GG. Because everything else is just skill.',
    'My gaming chair says I need to drink water. But my NPC friends are waiting...',
    'Why do PC gamers make the best secret agents? They always know the best escape routes (exits)!',
    'I asked my gaming buddy for advice. He said "Git gud." Helpful as always!',
  ],
};

export function getRandomTip(): string {
  const categories = ['trading', 'gaming'] as const;
  const category = categories[Math.floor(Math.random() * categories.length)];
  const tips = GAME_KNOWLEDGE.tips[category];
  return tips[Math.floor(Math.random() * tips.length)];
}

export function getRandomJoke(): string {
  const jokes = GAME_KNOWLEDGE.jokes;
  return jokes[Math.floor(Math.random() * jokes.length)];
}

export function findTriviaAnswer(question: string): string | null {
  const allTrivia = [
    ...GAME_KNOWLEDGE.trivia.general,
    ...GAME_KNOWLEDGE.trivia.cards,
    ...GAME_KNOWLEDGE.trivia.gaming,
  ];

  const lowerQ = question.toLowerCase();

  for (const item of allTrivia) {
    const keywords = item.q.toLowerCase().split(' ');
    const matchCount = keywords.filter(
      (k) => k.length > 3 && lowerQ.includes(k),
    ).length;
    if (matchCount >= 2) {
      return item.a;
    }
  }

  return null;
}
