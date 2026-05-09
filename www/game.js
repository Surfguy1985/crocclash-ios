// ============================================================
//  CROC CLASH — PRODUCTION v8.0
//  Online Multiplayer + TikTok Mini Game + Pillow Combat
//  WebSocket rooms, host/guest sync, TikTok SDK integration.
// ============================================================
(() => {
'use strict';

// ─── PERFORMANCE ───
const IS_MOBILE = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.matchMedia('(pointer:coarse)').matches;
const PERF_LOW = IS_MOBILE; // skip expensive FX on mobile
let _frameCount = 0; // for throttling mobile updates
const MOB_MAX_PARTS = 30; // max particles on mobile
const MOB_MAX_FLOATS = 8; // max floating text on mobile

// ─── ARENA ───
const AW = 960, AH = 540;
const FLOOR_Y = AH - 58;
const MAX_HP = 10;
const ROUND_TIME = 45, ROUNDS_TO_WIN = 2;

// ─── FIGHTERS (triple size) ───
const CW = 280, CH = 400;
const MOVE_SPD = 220, GRAVITY = 480, JUMP_VEL = -920;
const ATK_RANGE = 200, ATK_CD = 0.35;
const DASH_SPD = 580, DASH_DUR = 0.18, DASH_CD = 0.7;
const TAIL_RANGE = 240, TAIL_CD = 1.4;
const PARRY_WIN = 0.18, PARRY_CD = 0.55, PARRY_STUN = 0.6;
const LAUNCH_CD = 1.6, LAUNCH_SPD = 700, PILLOW_SIZE = 56;
const KB = 280, KB_UP = -160;
const COMEBACK_TH = 3;

// Special power cooldowns
const CD_FREEZE = 8, CD_SAX = 10, CD_LIGHTNING = 12, CD_MYSTERY = 15, CD_TORNADO = 4, CD_TAIL = 1.4;
const CD_SHOTGUN = 5, CD_UPPERCUT = 6, CD_BOOMERANG = 7, CD_RAPIDFIRE = 4;
const CD_INFERNO = 20; // Colosseum-exclusive ultimate — long cooldown
const CD_RAGE = 15; // Rage super — featured ability on 15s cooldown

// ─── JUICE ───
const HS_LIGHT = 0.06, HS_HEAVY = 0.12, HS_KO = 0.3, HS_PARRY = 0.1, HS_TAIL = 0.16, HS_LAUNCH = 0.2;
const SLO_DUR = 0.8, SLO_SCALE = 0.15, TRAUMA_DECAY = 1.8;

// ─── POWER DEFINITIONS ───
const POWERS = {
  freeze:    { name:'Freeze Ball',    key:'1', icon:'❄️',  cd: CD_FREEZE,    desc:'Freezes opponent 3s' },
  sax:       { name:'Saxophone',      key:'2', icon:'🎷',  cd: CD_SAX,       desc:'Dizzy blast wave' },
  lightning: { name:'Lightning',      key:'3', icon:'⚡',  cd: CD_LIGHTNING,  desc:'Sky strike 1 HP' },
  mystery:   { name:'Mystery Box',    key:'4', icon:'❓',  cd: CD_MYSTERY,   desc:'Random power up!' },
  tornado:   { name:'Tornado',        key:'5', icon:'🌪️', cd: CD_TORNADO,   desc:'Spin dash attack' },
  tailwhip:  { name:'Tail Whip',     key:'6', icon:'🦎',  cd: CD_TAIL,      desc:'Heavy tail smash' },
  shotgun:   { name:'Pillow Shotgun', key:'7', icon:'💥',  cd: CD_SHOTGUN,   desc:'5-pillow spread blast' },
  uppercut:  { name:'Pillow Uppercut',key:'8', icon:'🥊',  cd: CD_UPPERCUT,  desc:'Sky-launch melee' },
  boomerang: { name:'Boomerang',      key:'9', icon:'🪃',  cd: CD_BOOMERANG, desc:'Returns to sender' },
  rapidfire: { name:'Rapid Fire',     key:'0', icon:'🔥',  cd: CD_RAPIDFIRE, desc:'Pillow minigun burst' },
  inferno:   { name:'Inferno',        key:'!', icon:'☄️',  cd: CD_INFERNO,   desc:'Fire aura + mega fireball', colosseumOnly:true },
};
const POWER_KEYS = Object.keys(POWERS).filter(k => !POWERS[k].colosseumOnly);
const ALL_POWER_KEYS = Object.keys(POWERS);

// ─── ARENA / SCENE SYSTEM ───
const ARENAS = [
  { id:'boardwalk', name:'Branson Boardwalk', streakReq:0, unlock:'default' },
  { id:'swamp',     name:'Swamp Midnight',   streakReq:3, unlock:'Win 3 in a row' },
  { id:'rooftop',   name:'Neon Rooftop',     streakReq:3, unlock:'Win 3 in a row' },
  { id:'colosseum', name:'Croc Colosseum',   streakReq:0, unlock:'Beat all arenas' },
];
let currentArena = ARENAS[0];
let unlockedArenas = ['boardwalk'];
let arenaProgressionIdx = 0; // current position in arena chain for progression mode // earn others via win streaks

// ─── ARENA PLATFORMS (perch structures — walk past base, jump onto roof) ───
const ARENA_PLATFORMS = {
  boardwalk: [],
  swamp: [
    // Mossy tree stump — left-center area
    { x: 280, y: FLOOR_Y - 100, w: 180, h: 14, id: 'stump' }
  ],
  rooftop: [
    // AC unit / satellite dish — right-center
    { x: 460, y: FLOOR_Y - 105, w: 200, h: 14, id: 'acunit' }
  ],
  colosseum: [
    // Crumbled pillar — left side
    { x: 200, y: FLOOR_Y - 95, w: 160, h: 14, id: 'pillar_l' },
    // Raised stone slab — right side
    { x: 600, y: FLOOR_Y - 110, w: 170, h: 14, id: 'pillar_r' }
  ],
};
function getArenaPlatforms(){ return ARENA_PLATFORMS[currentArena.id] || []; }

// Platform landing helper — returns the platform top Y if croc should land, else null
function checkPlatformLand(c){
  const plats = getArenaPlatforms();
  const feet = c.y + c.h;
  const cx = c.x + c.w * 0.25; // use inner 50% of croc width
  const cw = c.w * 0.5;
  for(const p of plats){
    // Only land when falling downward and feet cross the platform top
    if(c.vy > 0 && feet >= p.y && feet <= p.y + 40 && cx + cw > p.x && cx < p.x + p.w){
      return p.y;
    }
  }
  return null;
}

// Check if croc is currently standing on a platform
function isOnPlatform(c){
  const plats = getArenaPlatforms();
  const feet = c.y + c.h;
  const cx = c.x + c.w * 0.25;
  const cw = c.w * 0.5;
  for(const p of plats){
    if(Math.abs(feet - p.y) < 3 && cx + cw > p.x && cx < p.x + p.w) return true;
  }
  return false;
}

// ─── RANKED TIER SYSTEM ───
const RANKED_TIERS = [
  { id:'bronze',   name:'Bronze Brawler',   icon:'🥉', minElo:0 },
  { id:'silver',   name:'Silver Snapper',   icon:'🥈', minElo:100 },
  { id:'gold',     name:'Gold Gator',       icon:'🥇', minElo:250 },
  { id:'platinum', name:'Platinum Predator', icon:'💎', minElo:500 },
  { id:'diamond',  name:'Diamond Crusher',  icon:'💠', minElo:800 },
  { id:'croc_king',name:'CROC KING',        icon:'👑', minElo:1200 },
];
let playerElo = 0;
function getPlayerTier(){ return RANKED_TIERS.slice().reverse().find(t => playerElo >= t.minElo) || RANKED_TIERS[0]; }
function eloChange(won){ const delta = won ? randInt(18,32) : -randInt(10,20); playerElo = Math.max(0, playerElo + delta); savePlayerData(); return delta; }

// ─── PERSISTENT STORAGE ───
const SAVE_KEY = 'croc_save_v2';
let playerName = ''; // set from localStorage or name-entry screen
function getWeekId(){ const d=new Date(); const jan1=new Date(d.getFullYear(),0,1); return d.getFullYear()+'-W'+Math.ceil(((d-jan1)/86400000+jan1.getDay()+1)/7); }
function getSundayMs(){
  const d=new Date(); const day=d.getDay();
  const next=new Date(d); next.setDate(d.getDate()+(7-day)%7); next.setHours(0,0,0,0);
  if(day===0) next.setDate(next.getDate()+7);
  return next.getTime();
}
function defaultSave(){
  return {
    playerName:null, // null = needs name entry
    elo:0, wins:0, streak:0, bestStreak:0, losses:0,
    bpXP:0, bpTier:0,
    arenas:['boardwalk'],
    weekId:getWeekId(), weekElo:0, weekWins:0, weekLosses:0,
    careerElo:0, careerWins:0, careerLosses:0, peakElo:0,
    history:[], // last 20 match results [{won,elo,delta,arena,time}]
    bots:null, // seeded bots for this week
    prevRank:0, // last known rank position
  };
}
function loadPlayerData(){
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if(!raw) return defaultSave();
    const d = JSON.parse(raw);
    // Weekly reset check: if weekId changed, soft-reset
    const curWeek = getWeekId();
    if(d.weekId !== curWeek){
      // Carry over career stats, soft-reset weekly
      d.careerElo = Math.max(d.careerElo||0, d.elo);
      d.careerWins = (d.careerWins||0) + (d.weekWins||0);
      d.careerLosses = (d.careerLosses||0) + (d.weekLosses||0);
      d.peakElo = Math.max(d.peakElo||0, d.elo);
      // Soft-reset ELO: keep 40% of previous ELO
      d.elo = Math.floor(d.elo * 0.4);
      d.weekId = curWeek;
      d.weekElo = d.elo;
      d.weekWins = 0;
      d.weekLosses = 0;
      d.streak = 0;
      d.bots = null; // regenerate bots for new week
      d.history = [];
      d.prevRank = 0;
    }
    return {...defaultSave(), ...d};
  } catch(e){ return defaultSave(); }
}
function savePlayerData(){
  try {
    const d = {
      playerName:playerName||null,
      elo:playerElo, wins:_memWins, streak:_memStreak, bestStreak:_bestStreak, losses:_memLosses,
      bpXP, bpTier,
      arenas:[...unlockedArenas],
      weekId:getWeekId(), weekElo:_weekElo, weekWins:_weekWins, weekLosses:_weekLosses,
      careerElo:_careerElo, careerWins:_careerWins, careerLosses:_careerLosses,
      peakElo:Math.max(_peakElo, playerElo),
      history:_matchHistory.slice(-20),
      bots:leaderboard.filter(e=>e.isBot),
      prevRank:getPlayerRank(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(d));
  } catch(e){}
}
let _bestStreak=0, _memLosses=0;
let _weekElo=0, _weekWins=0, _weekLosses=0;
let _careerElo=0, _careerWins=0, _careerLosses=0, _peakElo=0;
let _matchHistory=[]; // [{won,elo,delta,arena,opponent,time}]
let _prevRank=0;

// Restore on boot — called after _memWins/_memStreak are declared (see restoreOnBoot call below)
function restorePlayerData(){
  const d = loadPlayerData();
  playerName = d.playerName || '';
  playerElo = d.elo;
  _memWins = d.wins; _memStreak = d.streak; _bestStreak = d.bestStreak||0; _memLosses = d.losses||0;
  bpXP = d.bpXP||0; bpTier = d.bpTier||0;
  unlockedArenas = d.arenas && d.arenas.length ? [...d.arenas] : ['boardwalk'];
  _weekElo = d.weekElo||0; _weekWins = d.weekWins||0; _weekLosses = d.weekLosses||0;
  _careerElo = d.careerElo||0; _careerWins = d.careerWins||0; _careerLosses = d.careerLosses||0;
  _peakElo = d.peakElo||0;
  _matchHistory = d.history||[];
  _prevRank = d.prevRank||0;
}
function getDisplayName(){ return playerName || 'YOU'; }
// NOTE: restorePlayerData() is called after _memWins/_memStreak declarations

function addMatchResult(won, delta, arena){
  _matchHistory.push({
    won, elo:playerElo, delta, arena:arena||currentArena.id,
    time:Date.now()
  });
  if(_matchHistory.length > 20) _matchHistory.shift();
  if(won){ _weekWins++; } else { _weekLosses++; }
  savePlayerData();
}

// ─── WEEKLY LEADERBOARD (persistent seeded bots) ───
let leaderboard = [];
const LB_BOTS = [
  {name:'SwampKing99', base:780, style:'aggressive'},
  {name:'GatorGod',    base:920, style:'elite'},
  {name:'PillowPro',   base:540, style:'balanced'},
  {name:'CrocLord',    base:650, style:'defensive'},
  {name:'SnapperX',    base:350, style:'aggressive'},
  {name:'ScaleSlayer',  base:430, style:'balanced'},
  {name:'MightyMaw',   base:270, style:'defensive'},
  {name:'TailSpin',    base:160, style:'aggressive'},
  {name:'FangBoss',    base:500, style:'balanced'},
  {name:'NiteGator',   base:720, style:'elite'},
  {name:'BayouBoss',   base:380, style:'aggressive'},
  {name:'JawDropper',  base:610, style:'defensive'},
  {name:'SnapAttack',  base:200, style:'balanced'},
  {name:'CrocStar',    base:850, style:'elite'},
];
function seedRand(s){ return function(){ s=(s*16807)%2147483647; return(s-1)/2147483646; }; }
function generateWeekBots(){
  // Seed based on week so bots are consistent within a week
  const weekNum = parseInt(getWeekId().replace(/\D/g,''), 10);
  const rng = seedRand(weekNum * 31337);
  return LB_BOTS.map(bot => {
    const eloVar = Math.floor(rng() * 200 - 100); // ±100
    const elo = Math.max(50, bot.base + eloVar);
    const wins = Math.floor(3 + rng() * 25);
    const streak = Math.floor(rng() * 8);
    const tier = RANKED_TIERS.slice().reverse().find(t => elo >= t.minElo) || RANKED_TIERS[0];
    return { name:bot.name, wins, streak, elo, tier:tier.id, isBot:true, style:bot.style, prevElo:elo };
  });
}
function simulateBotProgress(){
  // Bots gain/lose ELO over time to feel alive
  // Simulate based on time elapsed since last open
  const now = Date.now();
  for(const bot of leaderboard){
    if(!bot.isBot) continue;
    // ~1 match per 20min per bot = small drift
    const drift = Math.floor(Math.random() * 30 - 10); // slightly positive bias
    bot.prevElo = bot.elo;
    bot.elo = Math.max(30, bot.elo + drift);
    const fakeWins = Math.random() > 0.4 ? 1 : 0;
    bot.wins += fakeWins;
    if(fakeWins) bot.streak = Math.min(bot.streak+1, 15);
    else bot.streak = 0;
    bot.tier = (RANKED_TIERS.slice().reverse().find(t => bot.elo >= t.minElo) || RANKED_TIERS[0]).id;
  }
}
function initLeaderboard(){
  // Load saved bots or generate fresh for this week
  const saved = loadPlayerData();
  if(saved.bots && saved.bots.length >= 10 && saved.weekId === getWeekId()){
    leaderboard = saved.bots;
  } else {
    leaderboard = generateWeekBots();
  }
  simulateBotProgress();
  // Ensure player entry exists
  const meIdx = leaderboard.findIndex(e => !e.isBot);
  const me = {
    name:getDisplayName(), wins:getTotalWins(), streak:getStreak(), elo:playerElo,
    tier:getPlayerTier().id, isBot:false, prevElo:_prevRank ? playerElo : 0
  };
  if(meIdx >= 0) leaderboard[meIdx] = me;
  else leaderboard.push(me);
  leaderboard.sort((a,b) => b.elo - a.elo);
  savePlayerData();
}
function updateLeaderboardEntry(){
  const me = leaderboard.find(e => !e.isBot);
  if(me){
    me.prevElo = me.elo;
    me.name = getDisplayName();
    me.wins = getTotalWins(); me.streak = getStreak(); me.elo = playerElo; me.tier = getPlayerTier().id;
  }
  leaderboard.sort((a,b) => b.elo - a.elo);
  savePlayerData();
}
function getPlayerRank(){
  const idx = leaderboard.findIndex(e => !e.isBot);
  return idx >= 0 ? idx + 1 : leaderboard.length;
}

// ─── DAILY CHALLENGE SYSTEM ───
const DAILY_CHALLENGES = [
  { desc:'Win 3 matches', check:()=>getTotalWins()>=_dailyStartWins+3, icon:'🏆' },
  { desc:'Get a 5-hit combo', check:()=>_dailyComboHit, icon:'💥' },
  { desc:'Win without taking damage', check:()=>_dailyPerfect, icon:'⭐' },
  { desc:'Use Rage power 2 times', check:()=>_dailyRageCount>=2, icon:'💀' },
  { desc:'Parry 3 attacks', check:()=>_dailyParryCount>=3, icon:'🛡️' },
  { desc:'Win with a Power Pillow Drive', check:()=>_dailyDiveKill, icon:'🌀' },
  { desc:'Land 20 pillow hits', check:()=>_dailyHitCount>=20, icon:'👊' },
  { desc:'Win on Swamp Midnight', check:()=>_dailySwampWin, icon:'🌙' },
];
let dailyChallenge = null, dailyChallengeComplete = false;
let _dailyStartWins=0, _dailyComboHit=false, _dailyPerfect=false;
let _dailyRageCount=0, _dailyParryCount=0, _dailyDiveKill=false;
let _dailyHitCount=0, _dailySwampWin=false;
function pickDailyChallenge(){
  const dayIdx = Math.floor(Date.now()/(1000*60*60*24));
  dailyChallenge = DAILY_CHALLENGES[dayIdx % DAILY_CHALLENGES.length];
  dailyChallengeComplete = false;
  _dailyStartWins=getTotalWins(); _dailyComboHit=false; _dailyPerfect=false;
  _dailyRageCount=0; _dailyParryCount=0; _dailyDiveKill=false;
  _dailyHitCount=0; _dailySwampWin=false;
}

// ─── WIN STREAK REWARDS ───
const STREAK_REWARDS = [
  { streak:3, reward:'Golden name glow + Swamp arena', icon:'✨' },
  { streak:5, reward:'Victory taunt animation', icon:'💃' },
  { streak:7, reward:'Rooftop arena unlock', icon:'🏙️' },
  { streak:10, reward:'Neon skin unlock for both', icon:'🌈' },
  { streak:15, reward:'CROC KING title', icon:'👑' },
];
let streakRewardShown = 0;

// ─── BATTLE PASS (Free 10-tier) ───
const SEASON_NAME = 'SEASON 1 — PILLOW WARS';
const BP_TIERS = [
  { tier:1, xpReq:0,    reward:'Title: Newcomer',       icon:'🐣', type:'title' },
  { tier:2, xpReq:100,  reward:'Gold name glow',         icon:'✨', type:'cosmetic' },
  { tier:3, xpReq:250,  reward:'Swamp Arena',            icon:'🌙', type:'arena' },
  { tier:4, xpReq:450,  reward:'Victory Dance emote',    icon:'💃', type:'emote' },
  { tier:5, xpReq:700,  reward:'Pillow Trail FX',        icon:'🪶', type:'vfx' },
  { tier:6, xpReq:1000, reward:'Rooftop Arena',          icon:'🏙️', type:'arena' },
  { tier:7, xpReq:1400, reward:'Croc Spin emote',        icon:'🌀', type:'emote' },
  { tier:8, xpReq:1900, reward:'Golden Pillow skin',     icon:'🥇', type:'weapon' },
  { tier:9, xpReq:2500, reward:'Neon Skin unlock',       icon:'🌈', type:'skin' },
  { tier:10,xpReq:3200, reward:'CROC KING Crown',        icon:'👑', type:'legendary' },
];
let bpXP = 0, bpTier = 0;
function addBPXP(amount){
  bpXP += amount;
  const oldTier = bpTier;
  for(let i = BP_TIERS.length-1; i >= 0; i--){
    if(bpXP >= BP_TIERS[i].xpReq){ bpTier = BP_TIERS[i].tier; break; }
  }
  if(bpTier > oldTier){
    const t = BP_TIERS[bpTier-1];
    slam(t.icon + ' TIER ' + bpTier + ': ' + t.reward, '#ffd740', 2);
    // Unlock arenas from battle pass
    if(t.type==='arena'&&t.reward.includes('Swamp')&&!unlockedArenas.includes('swamp')) unlockedArenas.push('swamp');
    if(t.type==='arena'&&t.reward.includes('Rooftop')&&!unlockedArenas.includes('rooftop')) unlockedArenas.push('rooftop');
  }
  savePlayerData();
  return bpTier - oldTier; // tiers gained
}

// ─── EMOTE SYSTEM ───
const EMOTES = [
  { id:'dance',  icon:'💃', name:'Dance',  anim:'dance' },
  { id:'flex',   icon:'💪', name:'Flex',   anim:'flex' },
  { id:'laugh',  icon:'😂', name:'Laugh',  anim:'laugh' },
  { id:'wave',   icon:'👋', name:'Wave',   anim:'wave' },
];
let emoteActive = null, emoteTimer = 0;

// ─── MUTATOR SYSTEM ───
const MUTATORS = [
  { id:'normal',     name:'STANDARD MATCH',      desc:'Normal rules',         icon:'⚔️' },
  { id:'lowgrav',    name:'LOW GRAVITY',          desc:'Float like a feather', icon:'🌙' },
  { id:'bigpillows', name:'GIANT PILLOWS',        desc:'Mega-sized projectiles',icon:'🛋️' },
  { id:'turbo',      name:'TURBO MODE',           desc:'Double speed chaos',   icon:'⚡' },
  { id:'tinyarena',  name:'TINY ARENA',           desc:'Shrinking battlefield',icon:'📦' },
];
let activeMutator = MUTATORS[0];
function rollMutator(){ return pick(MUTATORS); }

// ─── VICTORY FINISHERS ───
const FINISHERS_GARY = ['BELLY FLOP!!','GATOR CHOMP!!','TAIL TORNADO!!','PILLOW TSUNAMI!!'];
const FINISHERS_CARL = ['SAX SOLO!!','CROC ROCK!!','SNAP ATTACK!!','FEATHER STORM!!'];

// ─── KO HIGHLIGHT / CLIP SYSTEM ───
let koClipData = null; // stores data for generating KO clip
function captureKOClip(winner, loser){
  koClipData = {
    winner: winner.name,
    winnerChar: winner.charKey,
    loser: loser.name,
    loserChar: loser.charKey,
    winnerHP: winner.hp,
    combo: winner.maxCombo,
    hits: winner.hits,
    arena: currentArena.name,
    tier: getPlayerTier().name,
    streak: getStreak(),
    timestamp: Date.now(),
  };
}


// ─── SKIN DEFINITIONS ───
const SKIN_DEFS = {
  gary: [
    { id:'default', name:'Default',  src:'gary-sprite-lg.webp', winsReq:0 },
    { id:'golden',  name:'Golden',   src:'skins/gary-golden.webp', winsReq:5 },
    { id:'zombie',  name:'Zombie',   src:'skins/gary-zombie.webp', winsReq:10 },
    { id:'cowboy',  name:'Cowboy',   src:'skins/gary-cowboy.webp', winsReq:25 },
    { id:'neon',    name:'Neon',     src:'skins/gary-neon.webp', winsReq:50 },
  ],
  carl: [
    { id:'default', name:'Default',  src:'carl-sprite-lg.webp', winsReq:0 },
    { id:'golden',  name:'Golden',   src:'skins/carl-golden.webp', winsReq:5 },
    { id:'zombie',  name:'Zombie',   src:'skins/carl-zombie.webp', winsReq:10 },
    { id:'cowboy',  name:'Cowboy',   src:'skins/carl-cowboy.webp', winsReq:25 },
    { id:'neon',    name:'Neon',     src:'skins/carl-neon.webp', winsReq:50 },
  ],
};

// ─── UTILS ───
const lerp = (a,b,t) => a+(b-a)*t;
const clamp = (v,l,h) => Math.max(l,Math.min(h,v));
const dist = (x1,y1,x2,y2) => Math.hypot(x2-x1,y2-y1);
const rand = (a,b) => Math.random()*(b-a)+a;
const randInt = (a,b) => Math.floor(rand(a,b+1));
const pick = a => a[randInt(0,a.length-1)];
const TAU = Math.PI*2;
const _ps = Math.random()*1e3;
function noise1D(x){const i=Math.floor(x),f=x-i,u=f*f*(3-2*f);const a=Math.sin(i*127.1+_ps)*43758.5453;const b=Math.sin((i+1)*127.1+_ps)*43758.5453;return lerp(a-Math.floor(a),b-Math.floor(b),u)*2-1}

// ─── FUNNY TEXT ───
const ROUND_INTROS = ["PILLOW FIGHT!!","FEATHERS WILL FLY!!","CROC BRAWL!!","FLUFF OR FLIGHT!!","SCALY SMACKDOWN!!","ROLL OUT!!","IT'S GO TIME!!"];
const KO_LINES = ["SMOKED 'EM!!","FEATHERED!!","OUT COLD!!","PLUCKED!!","K.O.!!","DOWN!!","LIGHTS OUT!!"];
const PERFECT_LINES = ["FLAWLESS!!","UNTOUCHABLE!!","PILLOW KING!!","IMMACULATE!!","DOMINANCE!!"];
const PARRY_LINES = ["BLOCKED!!","DENIED!!","NOT TODAY!!","NOPE!!","NICE TRY!!","RIPOSTE!!"];
const DMG_WORDS = ["OOF","POW","BONK","THWAP","BWOK","ZAP","SPLAT","CRUNCH"];
const TAIL_WORDS = ["WHIPLASH!!","TAIL SMACK!!","SWIPE!!","REPTILE!!","COLD BLOOD!!"];
const LAUNCH_HIT_WORDS = ["DIRECT HIT!!","PILLOW BOMB!!","BULLSEYE!!","INCOMING!!","FLUFFED!!","AIR MAIL!!","LAUNCHED!!"];
const COMBO_MS = {3:"THREE!",5:"FIVE HIT!!",7:"SEVEN!!",10:"TEN HIT COMBO!!",15:"UNSTOPPABLE!!",20:"LEGENDARY!!"};
const WIN_LINES = ["WINS!!","DOMINATES!!","STANDS TALL!!","TAKES IT!!","IS VICTORIOUS!!"];
const COMEBACK_LINES = ["COMEBACK TIME!!","NOT DONE YET!!","LAST STAND!!","DESPERATION!!","FIGHT BACK!!"];

// ─── In-Memory Progression (no localStorage) ───
const LS_WINS = 'crocClashTotalWins', LS_STREAK = 'crocClashStreak';
let _memWins=0, _memStreak=0;
function getTotalWins(){ return _memWins; }
function getStreak(){ return _memStreak; }
function addWin(){ _memWins++; _memStreak++; if(_memStreak>_bestStreak)_bestStreak=_memStreak; savePlayerData(); return {wins:_memWins,streak:_memStreak}; }
function resetStreak(){ _memStreak=0; _memLosses++; savePlayerData(); }
// Now that _memWins/_memStreak exist, restore saved data
restorePlayerData();

// ─── IMAGE LOADING ───
const images = {};
let imagesLoaded = 0;
// Critical images — loaded before game starts
const IMAGE_LIST = [
  ['arena','arena-bg.webp'],
  ['arenaSwamp','arena-swamp-bg.webp'],
  ['arenaColosseum','arena-colosseum-bg.webp'],
  ['gary','gary-sprite-lg.webp'],
  ['carl','carl-sprite-lg.webp'],
  ['garyCU','gary-closeup.webp'],
  ['carlCU','carl-closeup.webp'],
  // Swing animation frames — Gary
  ['gary_swing1','gary-swing-1.webp'],
  ['gary_swing2','gary-swing-2.webp'],
  ['gary_swing3','gary-swing-3.webp'],
  // Swing animation frames — Carl
  ['carl_swing1','carl-swing-1.webp'],
  ['carl_swing2','carl-swing-2.webp'],
  ['carl_swing3','carl-swing-3.webp'],
];
// Deferred images — loaded in background after game is ready
const DEFERRED_IMAGES = [
  ['gary_golden','skins/gary-golden.webp'],
  ['gary_zombie','skins/gary-zombie.webp'],
  ['gary_cowboy','skins/gary-cowboy.webp'],
  ['gary_neon','skins/gary-neon.webp'],
  ['carl_golden','skins/carl-golden.webp'],
  ['carl_zombie','skins/carl-zombie.webp'],
  ['carl_cowboy','skins/carl-cowboy.webp'],
  ['carl_neon','skins/carl-neon.webp'],
];
function loadImages(cb) {
  let total = IMAGE_LIST.length;
  if(total === 0){ cb(); return; }
  IMAGE_LIST.forEach(([key, src]) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { images[key] = img; imagesLoaded++; if(imagesLoaded >= total) cb(); };
    img.onerror = () => { imagesLoaded++; if(imagesLoaded >= total) cb(); };
    img.src = src;
  });
}
function loadDeferredImages(){
  DEFERRED_IMAGES.forEach(([key, src]) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { images[key] = img; };
    img.src = src;
  });
}
function getSpriteForCroc(c) {
  // c.charKey = 'gary' | 'carl', c.skin = skin id
  const skinMap = { gary: { default:'gary', golden:'gary_golden', zombie:'gary_zombie', cowboy:'gary_cowboy', neon:'gary_neon' }, carl: { default:'carl', golden:'carl_golden', zombie:'carl_zombie', cowboy:'carl_cowboy', neon:'carl_neon' } };
  const key = skinMap[c.charKey]?.[c.skin] || c.charKey;
  return images[key] || images[c.charKey];
}

// ─── PREMIUM AUDIO ENGINE v2.0 ───
// Layered multi-voice synthesis with noise bursts, filtered sweeps,
// proper ADSR envelopes and spatial panning for premium arcade feel.
let actx = null;
let masterGain = null;
let crowdGain = null, crowdSource = null;

function initAudio() {
  if(!actx){
    actx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = actx.createGain();
    masterGain.gain.value = 0.85;
    // Master compressor for punch
    const comp = actx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 12;
    comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.15;
    masterGain.connect(comp).connect(actx.destination);
  }
  if(actx.state === 'suspended') actx.resume();
  startCrowdAmbience();
}

// Enhanced tone with ADSR envelope
function tone(f,d,tp='square',v=.1,dl=0,pan=0){
  if(!actx||!masterGain)return;
  try{
    const t=actx.currentTime+dl;
    const o=actx.createOscillator(),g=actx.createGain();
    o.type=tp;o.frequency.setValueAtTime(f,t);
    // ADSR: quick attack, sustain, exponential release
    const atk=Math.min(0.008,d*0.1);
    g.gain.setValueAtTime(0.001,t);
    g.gain.linearRampToValueAtTime(v,t+atk);
    g.gain.setValueAtTime(v*0.85,t+atk+0.01);
    g.gain.exponentialRampToValueAtTime(.001,t+d);
    // Stereo pan
    if(pan!==0&&actx.createStereoPanner){
      const pn=actx.createStereoPanner();
      pn.pan.value=clamp(pan,-1,1);
      o.connect(g).connect(pn).connect(masterGain);
    } else {
      o.connect(g).connect(masterGain);
    }
    o.start(t);o.stop(t+d);
  }catch(e){}
}

// Noise burst — percussive impact layer
function noiseBurst(dur=0.06,vol=0.12,hpFreq=800,lpFreq=5000,dl=0){
  if(!actx||!masterGain)return;
  try{
    const t=actx.currentTime+dl;
    const bufLen=Math.ceil(actx.sampleRate*dur*2);
    const buf=actx.createBuffer(1,bufLen,actx.sampleRate);
    const d=buf.getChannelData(0);
    for(let i=0;i<bufLen;i++) d[i]=(Math.random()*2-1);
    const src=actx.createBufferSource();src.buffer=buf;
    const hp=actx.createBiquadFilter();hp.type='highpass';hp.frequency.value=hpFreq;
    const lp=actx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=lpFreq;
    const g=actx.createGain();
    g.gain.setValueAtTime(0.001,t);
    g.gain.linearRampToValueAtTime(vol,t+0.003);
    g.gain.exponentialRampToValueAtTime(0.001,t+dur);
    src.connect(hp).connect(lp).connect(g).connect(masterGain);
    src.start(t);src.stop(t+dur);
  }catch(e){}
}

// Filtered sweep — whoosh/swoosh layer
function sweep(startF,endF,dur=0.15,vol=0.08,tp='sawtooth',dl=0){
  if(!actx||!masterGain)return;
  try{
    const t=actx.currentTime+dl;
    const o=actx.createOscillator(),g=actx.createGain();
    const lp=actx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=3000;lp.Q.value=3;
    o.type=tp;
    o.frequency.setValueAtTime(startF,t);
    o.frequency.exponentialRampToValueAtTime(Math.max(endF,20),t+dur);
    lp.frequency.setValueAtTime(startF*4,t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(endF*2,60),t+dur);
    g.gain.setValueAtTime(0.001,t);
    g.gain.linearRampToValueAtTime(vol,t+dur*0.15);
    g.gain.exponentialRampToValueAtTime(0.001,t+dur);
    o.connect(lp).connect(g).connect(masterGain);
    o.start(t);o.stop(t+dur);
  }catch(e){}
}

// Sub-bass thump
function subThump(freq=50,dur=0.25,vol=0.2,dl=0){
  if(!actx||!masterGain)return;
  try{
    const t=actx.currentTime+dl;
    const o=actx.createOscillator(),g=actx.createGain();
    o.type='sine';o.frequency.setValueAtTime(freq,t);
    o.frequency.exponentialRampToValueAtTime(20,t+dur);
    g.gain.setValueAtTime(vol,t);
    g.gain.exponentialRampToValueAtTime(0.001,t+dur);
    o.connect(g).connect(masterGain);
    o.start(t);o.stop(t+dur);
  }catch(e){}
}

// ─── CROWD AMBIENCE (DISABLED — was causing persistent audio fuzz/static) ───
function startCrowdAmbience(){}
function setCrowdVolume(v){}
function muteCrowd(){}
function unmuteCrowd(){}

// ─── PREMIUM SFX ───
function sfxHit(c){
  const p=200+Math.min(c,20)*12+rand(-8,8);
  // Tonal body
  tone(p,.08,'sawtooth',.16);
  tone(p*1.5,.04,'square',.07,.005);
  // Noise crack for percussive impact
  noiseBurst(0.04,0.14+Math.min(c,15)*0.005,1200,6000);
  // Sub weight
  subThump(80+c*5,0.08,0.08);
}
function sfxParry(){
  // Bright metallic ring
  tone(880,.08,'sine',.18);
  tone(1320,.1,'sine',.14,.015);
  tone(1760,.08,'sine',.1,.03);
  tone(2640,.06,'sine',.06,.04);
  // Shimmer noise
  noiseBurst(0.06,0.12,3000,12000,.01);
  sweep(3000,800,0.12,0.06,'sine',.02);
}
function sfxDash(){
  // Whoosh
  sweep(600,150,0.14,0.1,'sawtooth');
  noiseBurst(0.08,0.08,200,3000);
  tone(300,.06,'triangle',.07);
}
function sfxBounce(){
  const f=400+rand(-15,15);
  tone(f,.06,'sine',.1);
  tone(f*1.5,.04,'sine',.05,.01);
  subThump(60,0.06,0.06);
  noiseBurst(0.03,0.05,500,3000);
}
function sfxSpecial(){
  tone(150,.4,'sawtooth',.12);
  tone(240,.3,'square',.08,.04);
  sweep(100,600,0.3,0.08,'sawtooth');
  subThump(40,0.35,0.12);
  noiseBurst(0.08,0.1,400,2000,.05);
}
function sfxTailWhip(){
  // Heavy sweep whoosh
  sweep(500,80,0.25,0.16,'sawtooth');
  tone(110,.3,'sawtooth',.2);
  tone(220,.2,'square',.14,.03);
  noiseBurst(0.1,0.18,300,4000,.02);
  subThump(50,0.3,0.15);
}
function sfxKO(){
  // Cinematic impact
  subThump(30,0.8,0.3);
  subThump(50,0.5,0.2,.1);
  tone(80,.7,'sawtooth',.24);
  tone(60,.8,'square',.2,.08);
  noiseBurst(0.15,0.25,200,6000);
  noiseBurst(0.25,0.15,100,3000,.08);
  sweep(400,40,0.6,0.12,'sawtooth',.1);
  tone(180,.4,'sine',.14,.2);
}
function sfxRound(){
  // Arcade fight bell
  tone(523,.1,'square',.1);
  tone(659,.1,'square',.1,.08);
  tone(784,.18,'square',.12,.16);
  tone(1047,.12,'sine',.08,.22);
  noiseBurst(0.04,0.06,2000,8000,.16);
}
function sfxPerfect(){
  // Shimmering victory fanfare
  [523,659,784,1047].forEach((f,i)=>{
    tone(f,.08,'sine',.14,i*.06);
    tone(f*2,.04,'sine',.06,i*.06+.02);
  });
  tone(1568,.25,'sine',.16,.28);
  noiseBurst(0.06,0.08,4000,12000,.24);
}
function sfxCombo(c){
  const b=420+c*14;
  tone(b,.08,'square',.12);
  tone(b*1.25,.08,'square',.1,.04);
  tone(b*1.5,.12,'square',.12,.08);
  noiseBurst(0.03,0.06+c*0.003,1500,6000,.06);
  if(c>=7) tone(b*2,.06,'sine',.08,.1);
}
function sfxComeback(){
  subThump(40,0.4,0.18);
  tone(100,.3,'sawtooth',.18);
  tone(160,.22,'square',.14,.08);
  sweep(80,300,0.35,0.1,'sawtooth',.1);
}
function sfxLaunch(){
  // Pillow throw whoosh
  sweep(200,800,0.15,0.12,'triangle');
  tone(180,.12,'triangle',.14);
  tone(350,.1,'sine',.1,.03);
  noiseBurst(0.05,0.1,400,4000);
}
function sfxLaunchHit(){
  // Massive pillow impact
  subThump(50,0.35,0.22);
  tone(80,.35,'sawtooth',.22);
  tone(120,.28,'square',.16,.04);
  noiseBurst(0.12,0.22,300,5000);
  noiseBurst(0.06,0.12,1500,8000,.04);
  sweep(800,100,0.3,0.1,'sawtooth',.05);
}
function sfxFlyUp(){
  sweep(150,600,0.4,0.1,'sine');
  tone(200,.35,'sine',.1);
  tone(350,.25,'sine',.08,.08);
}
function sfxLand(){
  subThump(40,0.3,0.2);
  tone(60,.3,'sawtooth',.16);
  noiseBurst(0.1,0.16,200,3000);
  noiseBurst(0.06,0.1,50,800,.03);
}
function sfxFreeze(){
  // Crystalline ice
  [1200,1500,1900,2400].forEach((f,i)=>{
    tone(f,.14,'sine',.12,i*.04);
    tone(f*0.5,.08,'triangle',.06,i*.04+.02);
  });
  sweep(3000,600,0.25,0.08,'sine',.12);
  noiseBurst(0.08,0.1,3000,12000,.08);
}
function sfxSax(){
  // Jazzy sax riff
  const notes=[330,370,440,392,330,440];
  notes.forEach((f,i)=>{
    tone(f,.14,'sine',.14,i*.09);
    tone(f*1.5,.08,'sine',.06,i*.09+.04);
    tone(f*2,.04,'sine',.03,i*.09+.05);
  });
  noiseBurst(0.04,0.04,2000,6000,.1);
}
function sfxLightning(){
  subThump(30,1.0,0.25);
  tone(80,.7,'sawtooth',.22);
  tone(60,.9,'square',.2,.04);
  noiseBurst(0.2,0.25,100,8000,.08);
  noiseBurst(0.3,0.15,50,4000,.15);
  sweep(600,30,0.8,0.12,'sawtooth',.1);
}
function sfxMystery(){
  const notes=[523,659,784,1047,1319,1568];
  notes.forEach((f,i)=>{
    tone(f,.1,'sine',.12,i*.07);
    tone(f*0.5,.06,'triangle',.05,i*.07);
  });
  noiseBurst(0.04,0.06,4000,10000,.35);
}
function sfxRage(){
  subThump(30,0.6,0.25);
  tone(80,.5,'sawtooth',.22);
  tone(50,.65,'square',.28,.08);
  sweep(50,300,0.5,0.14,'sawtooth',.12);
  noiseBurst(0.15,0.18,100,3000,.1);
}
function sfxMegaBomb(){
  subThump(25,1.8,0.35);
  subThump(40,1.2,0.25,.15);
  tone(40,1.6,'sawtooth',.32);
  tone(60,1.3,'square',.26,.08);
  noiseBurst(0.3,0.3,100,6000,.05);
  noiseBurst(0.4,0.2,50,3000,.2);
  sweep(600,25,1.2,0.15,'sawtooth',.15);
}
// New combat SFX
function sfxShotgun(){
  // Pumped spread blast
  subThump(60,0.2,0.2);
  noiseBurst(0.08,0.2,500,8000);
  noiseBurst(0.12,0.14,200,4000,.02);
  sweep(400,1200,0.1,0.12,'sawtooth');
  tone(250,.1,'sawtooth',.14);
  for(let i=0;i<5;i++) tone(300+i*60,.06,'triangle',.04,i*.02);
}
function sfxUppercut(){
  // Rising power punch
  sweep(100,1200,0.2,0.16,'sawtooth');
  subThump(70,0.15,0.18);
  noiseBurst(0.06,0.18,600,6000,.02);
  tone(200,.15,'square',.14);
  tone(400,.1,'sine',.1,.05);
  tone(800,.08,'sine',.08,.1);
}
function sfxBoomerang(){
  // Spinning whoosh
  sweep(300,800,0.15,0.1,'triangle');
  sweep(800,300,0.15,0.08,'triangle',.15);
  tone(440,.2,'sine',.08);
  tone(660,.15,'sine',.06,.05);
  noiseBurst(0.06,0.08,1000,5000,.03);
}
function sfxRapidFire(){
  // Machine gun pillow burst
  for(let i=0;i<6;i++){
    tone(250+i*30,.04,'square',.08+i*0.005,i*.06);
    noiseBurst(0.025,0.08,800,5000,i*.06);
  }
  sweep(200,500,0.35,0.06,'triangle');
}

// ─── NARRATION AUDIO FILES ───
let narrFight = null, narrKO = null;
function loadNarration(){
  narrFight = new Audio('audio/narr-fight.mp3');
  narrFight.volume = 0.7;
  narrKO = new Audio('audio/narr-ko.mp3');
  narrKO.volume = 0.7;
}
function playNarr(el){ if(!el) return; try{ el.currentTime=0; el.play().catch(()=>{}); }catch(e){} }

// ─── VIDEO OVERLAY ───
// ─── VIDEO SYSTEM v4 — Blob-Preloaded, Instant Playback, Zero-Glitch ───
let videoPlaying = false, videoLocked = false, videoEl = null, videoTimeout = null;
let videoCooldown = 0;
const VIDEO_COOLDOWN_SEC = 3.5;
let videoElB = null;
let activeVidSlot = 'A';

const VID_POOL = {
  ko_gary:   ['video/ko-gary-wins.mp4','video/ko-gary-wins-2.mp4','video/special-ko.mp4','video/special-lightning.mp4','video/special-freeze.mp4','video/special-saxophone.mp4'],
  ko_carl:   ['video/ko-carl-wins.mp4','video/ko-carl-wins-2.mp4','video/special-ko.mp4','video/special-lightning.mp4','video/special-mystery.mp4','video/special-tornado.mp4'],
  tornado:   ['video/special-tornado.mp4'],
  tailwhip:  ['video/special-tail-whip.mp4'],
  parry:     ['video/special-parry.mp4'],
  pillow:    ['video/special-pillow-launch.mp4','video/special-bounce.mp4'],
  shotgun:   ['video/special-pillow-launch.mp4'],
  uppercut:  ['video/special-ko.mp4'],
  boomerang: ['video/special-bounce.mp4'],
  rapidfire: ['video/special-pillow-launch.mp4'],
  freeze:    ['video/special-freeze.mp4'],
  sax:       ['video/special-saxophone.mp4'],
  lightning: ['video/special-lightning.mp4'],
  mystery:   ['video/special-mystery.mp4'],
  rage:      ['video/special-ko.mp4'],
  mega:      ['video/special-ko.mp4'],
  combo:     ['video/special-bounce.mp4','video/special-ko.mp4'],
  match_intro: ['video/match-intro.mp4'],
};
const vidLastIdx = {};
function getRotatedVid(category){
  const pool = VID_POOL[category];
  if(!pool || pool.length === 0) return null;
  if(pool.length === 1) return pool[0];
  let idx = (vidLastIdx[category] ?? -1) + 1;
  if(idx >= pool.length) idx = 0;
  vidLastIdx[category] = idx;
  return pool[idx];
}

// ── Blob preload system: fetch every video into memory at boot ──
// Maps original src → blob URL for instant playback
const videoBlobCache = new Map();
let videoPreloadDone = false;
let videoPreloadCount = 0;
let videoPreloadTotal = 0;

function getVideoBlob(src){
  return videoBlobCache.get(src) || src; // fallback to network if not cached yet
}

async function preloadAllVideos(){
  const allSrcs = new Set();
  Object.values(VID_POOL).forEach(arr => arr.forEach(s => allSrcs.add(s)));
  videoPreloadTotal = allSrcs.size;
  videoPreloadCount = 0;

  // Fetch all in parallel with concurrency limit of 4
  const srcs = [...allSrcs];
  const BATCH = 4;
  for(let i = 0; i < srcs.length; i += BATCH){
    const batch = srcs.slice(i, i + BATCH);
    await Promise.all(batch.map(async src => {
      try {
        const resp = await fetch(src);
        if(!resp.ok) throw new Error(resp.status);
        const blob = await resp.blob();
        const blobUrl = URL.createObjectURL(blob);
        videoBlobCache.set(src, blobUrl);
        // Prime a hidden video element to decode first frames
        const primer = document.createElement('video');
        primer.muted = true; primer.playsInline = true; primer.preload = 'auto';
        primer.src = blobUrl;
        primer.load();
        // Wait for enough data to play
        await new Promise(r => {
          primer.addEventListener('canplaythrough', r, {once:true});
          setTimeout(r, 3000); // don't block forever
        });
      } catch(e){
        console.warn('Video preload failed:', src, e);
      }
      videoPreloadCount++;
    }));
  }
  videoPreloadDone = true;
  console.log(`Video preload complete: ${videoBlobCache.size}/${videoPreloadTotal} cached`);
}

function getKOVideo(winner){
  return getRotatedVid(winner === p1 ? 'ko_gary' : 'ko_carl');
}

let _activeVideoEl = null; // track which video element is currently the 'live' one
function initVideoEl(el){
  if(!el) return;
  el.muted = true; el.playsInline = true; // muted for preload only, unmuted on play
  el.addEventListener('ended', () => {
    // Only respect ended from the ACTIVE video element — ignore outgoing crossfade
    if(el !== _activeVideoEl) return;
    if(!matchIntroPlaying) hideVideo();
  });
  el.addEventListener('error', () => {
    if(el !== _activeVideoEl) return;
    if(!matchIntroPlaying) hideVideo();
  });
  // All videos play to completion — no tap/click to dismiss
  el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
  el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); }, {passive:false});
  el.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); }, {passive:false});
}
function initVideoOverlay(){
  videoEl = document.getElementById('special-video');
  if(!videoEl) return;
  initVideoEl(videoEl);
  videoElB = videoEl.cloneNode(false);
  videoElB.id = 'special-video-b';
  videoElB.removeAttribute('src');
  videoEl.parentNode.insertBefore(videoElB, videoEl.nextSibling);
  initVideoEl(videoElB);
  // Defer video preloading — start after a short delay so game is playable first
  setTimeout(() => preloadAllVideos(), 3000);
}

// Bulletproof play helper: resolves src through blob cache, retries with muted fallback
async function safePlay(el, src){
  const blobSrc = getVideoBlob(src);
  el.playsInline = true;
  // Only change src if different (avoids reload stall)
  if(!el.src || !el.src.startsWith('blob:') || el.getAttribute('data-orig-src') !== src){
    el.src = blobSrc;
    el.setAttribute('data-orig-src', src);
  }
  el.currentTime = 0;
  // Try unmuted first (user has interacted, so audio should work)
  el.muted = false; el.volume = 1;
  try {
    await el.play();
  } catch(e1){
    // Autoplay blocked with audio — retry muted (better than no video)
    try {
      el.muted = true; el.volume = 0;
      await new Promise(r => setTimeout(r, 50));
      await el.play();
    } catch(e2){
      console.warn('Video play failed after retry:', src, e2.message);
      return false;
    }
  }
  return true;
}

function playSpecialVideo(category, duration, locked){
  duration = duration || 2000;
  if(!videoEl || !videoElB) return;
  // Locked videos (KO / round-end / match-end) ALWAYS play, overriding any current video
  if(locked && videoPlaying){
    // Force-stop current video so the locked one can take over
    hideVideoImmediate();
  }
  if(videoPlaying && videoLocked) return;
  if(!locked && videoCooldown > 0) return;
  muteCrowd(); // silence crowd ambience during video so audio is clean
  const src = typeof category === 'string' && category.startsWith('video/') ? category : getRotatedVid(category);
  if(!src) return;
  const incoming = (activeVidSlot === 'A') ? videoElB : videoEl;
  const outgoing = (activeVidSlot === 'A') ? videoEl : videoElB;
  if(videoPlaying && !locked && outgoing.getAttribute('data-orig-src') === src) return;
  videoLocked = true; // ALL videos are unskippable — must play to completion
  if(!locked) videoCooldown = VIDEO_COOLDOWN_SEC;
  incoming.style.opacity = '0';
  incoming.style.display = 'block';
  incoming.style.pointerEvents = 'none'; // block all interaction during playback

  _activeVideoEl = incoming; // mark this as the live element for ended/error events
  safePlay(incoming, src).then(ok => {
    if(!ok){ incoming.style.display = 'none'; _activeVideoEl = null; return; }
    incoming.style.opacity = '1';
    // Crossfade out old video
    if(videoPlaying && outgoing.style.display !== 'none'){
      outgoing.style.opacity = '0';
      setTimeout(() => { outgoing.pause(); outgoing.style.display = 'none'; }, 400);
    }
    // Use actual video duration for the safety timeout (not the passed estimate)
    // Poll for duration since it may not be available immediately after play()
    function setSafetyTimeout(){
      const realDur = incoming.duration;
      if(realDur && isFinite(realDur) && realDur > 0.5){
        const safetyMs = realDur * 1000 + 2000;
        if(videoTimeout) clearTimeout(videoTimeout);
        videoTimeout = setTimeout(() => { if(videoPlaying) hideVideo(); }, safetyMs);
      } else {
        // Duration not available yet — retry shortly, or fallback after 1s
        setTimeout(() => {
          const d2 = incoming.duration;
          if(d2 && isFinite(d2) && d2 > 0.5){
            const ms2 = d2 * 1000 + 2000;
            if(videoTimeout) clearTimeout(videoTimeout);
            videoTimeout = setTimeout(() => { if(videoPlaying) hideVideo(); }, ms2);
          } else {
            // Absolute fallback
            if(videoTimeout) clearTimeout(videoTimeout);
            videoTimeout = setTimeout(() => { if(videoPlaying) hideVideo(); }, duration + 3000);
          }
        }, 500);
      }
    }
    setSafetyTimeout();
  });

  activeVidSlot = (activeVidSlot === 'A') ? 'B' : 'A';
  videoPlaying = true;
  if(videoTimeout) clearTimeout(videoTimeout);
}

function hideVideo(){
  if(!videoEl) return;
  if(matchIntroPlaying) return;
  videoEl.style.opacity = '0';
  if(videoElB) videoElB.style.opacity = '0';
  setTimeout(() => {
    if(matchIntroPlaying) return;
    if(videoEl.style.opacity !== '0') return;
    hideVideoImmediate();
  }, 400); // match CSS transition duration (350ms + buffer)
}

function hideVideoImmediate(){
  [videoEl, videoElB].forEach(v => {
    if(!v) return;
    v.muted = true; v.volume = 0;
    v.pause();
    v.style.display = 'none';
    v.style.opacity = '0';
  });
  videoPlaying = false;
  videoLocked = false;
  if(videoTimeout){ clearTimeout(videoTimeout); videoTimeout = null; }
  unmuteCrowd(); // bring crowd ambience back after video ends
}

// ─── CANVAS ───
const canvas = document.getElementById('gc'), ctx = canvas.getContext('2d');
let W, H, sc, ox, oy;
// baseSc is the "resting" scale computed at resize; dynSc is the current
// (possibly zoomed-out) scale used by the renderer.
let baseSc = 1, dynSc = 1;
function resize(){
  W=innerWidth; H=innerHeight;
  // Mobile: cap canvas resolution to reduce fill rate (max 720p equivalent)
  if(PERF_LOW){
    const maxDim = 720;
    const ratio = Math.min(maxDim/W, maxDim/H, 1);
    canvas.width = Math.round(W * ratio);
    canvas.height = Math.round(H * ratio);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    const rW = canvas.width, rH = canvas.height;
    sc = Math.min(rW/AW, rH/AH);
    ox = (rW - AW*sc)/2;
    // Anchor game to BOTTOM of screen
    oy = rH - AH*sc;
  } else {
    canvas.width=W; canvas.height=H;
    const pad = 4;
    sc = Math.min((W - pad*2)/AW, (H - pad*2)/AH);
    ox = (W - AW*sc)/2;
    // Anchor game to BOTTOM of screen
    oy = H - AH*sc;
  }
  baseSc = sc;
  dynSc = sc;
  // Position HTML HUD to align with the game area edges
  const hud = document.getElementById('hud');
  const legend = document.getElementById('key-legend');
  if(hud){
    // HUD near top of game area — use a small offset from game top
    hud.style.top = Math.max(0, Math.floor(oy) + 2) + 'px';
    hud.style.left = Math.max(0, Math.floor(ox)) + 'px';
    hud.style.right = Math.max(0, Math.floor(ox)) + 'px';
  }
  if(legend){
    legend.style.bottom = '4px';
    legend.style.left = Math.max(0, Math.floor(ox)) + 'px';
    legend.style.right = Math.max(0, Math.floor(ox)) + 'px';
  }
}
addEventListener('resize', resize); resize();

// ─── CUSTOMIZABLE KEY BINDINGS ───
const DEFAULT_BINDS_P1 = {
  left:'ArrowLeft', right:'ArrowRight', up:'ArrowUp', down:'ArrowDown',
  attack:'KeyS', dash:'KeyA', parry:'KeyF',
  launch:'KeyD', power1:'KeyX', power2:'KeyC', power3:'KeyZ', power4:'KeyV', rage:'KeyR'
};
const DEFAULT_BINDS_P2 = {
  left:'KeyJ', right:'KeyL', up:'KeyI', down:'KeyK',
  attack:'KeyH', dash:'KeyG', parry:'KeyY',
  launch:'KeyU', power1:'KeyN', power2:'KeyM', power3:'KeyB', power4:'Comma', rage:'KeyT'
};
const ACTION_LABELS = {
  left:'Move Left', right:'Move Right', up:'Jump', down:'Crouch/Down',
  attack:'Smack', dash:'Dash', parry:'Parry',
  launch:'Launch 🎯', power1:'Power 1', power2:'Power 2', power3:'Power 3', power4:'Power 4', rage:'Rage'
};
const BINDS_VERSION = 3; // bump when defaults change to clear stale saved binds
function loadBindings(){
  try {
    const s = localStorage.getItem('croc_keybinds');
    if(s){
      const d = JSON.parse(s);
      // If saved bindings are from an older default version, discard them
      if(d._v !== BINDS_VERSION){ localStorage.removeItem('croc_keybinds'); return { p1:{...DEFAULT_BINDS_P1}, p2:{...DEFAULT_BINDS_P2} }; }
      return { p1:{...DEFAULT_BINDS_P1,...d.p1}, p2:{...DEFAULT_BINDS_P2,...d.p2} };
    }
  } catch(e){}
  return { p1:{...DEFAULT_BINDS_P1}, p2:{...DEFAULT_BINDS_P2} };
}
function saveBindings(){ localStorage.setItem('croc_keybinds', JSON.stringify({...keyBinds, _v:BINDS_VERSION})); }
let keyBinds = loadBindings();

function codeToLabel(code){
  if(!code) return '?';
  if(code.startsWith('Key')) return code.slice(3);
  if(code.startsWith('Digit')) return code.slice(5);
  if(code==='ArrowUp') return '↑';
  if(code==='ArrowDown') return '↓';
  if(code==='ArrowLeft') return '←';
  if(code==='ArrowRight') return '→';
  if(code==='Space') return 'SPACE';
  if(code==='ShiftLeft'||code==='ShiftRight') return 'SHIFT';
  if(code==='ControlLeft'||code==='ControlRight') return 'CTRL';
  if(code==='AltLeft'||code==='AltRight') return 'ALT';
  if(code==='Backquote') return '`';
  if(code==='Minus') return '-';
  if(code==='Equal') return '=';
  if(code==='BracketLeft') return '[';
  if(code==='BracketRight') return ']';
  if(code==='Backslash') return '\\';
  if(code==='Semicolon') return ';';
  if(code==='Quote') return "'";
  if(code==='Comma') return ',';
  if(code==='Period') return '.';
  if(code==='Slash') return '/';
  return code;
}

// ─── INPUT ───
const keys = {}, jp = {};
document.addEventListener('keydown', e => {
  // Don't block typing in input fields (lobby code input, etc.)
  const tag = e.target.tagName;
  if(tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if(!keys[e.code]) jp[e.code]=true; keys[e.code]=true; e.preventDefault();
  // Secret sequence tracking (only during fight, Colosseum only)
  if(state === 'playing' && currentArena.id === 'colosseum'){
    const rawKey = e.key.toLowerCase();
    // Determine which player pressed this key
    // P1 uses left side of keyboard, P2 uses right side — just track for both
    pushSeq('p1', rawKey);
    pushSeq('p2', rawKey);
    // Check fireball aura sequence: LPLPLP
    if(checkSeq('p1', SEQ_FIREBALL_AURA) && p1 && p1.alive && (!p1.secretAuraCD || p1.secretAuraCD<=0) && !p1.fireAuraActive){
      clearSeq('p1'); activateFireballAura(p1, p2);
    } else if(checkSeq('p2', SEQ_FIREBALL_AURA) && p2 && p2.alive && (!p2.secretAuraCD || p2.secretAuraCD<=0) && !p2.fireAuraActive){
      clearSeq('p2'); activateFireballAura(p2, p1);
    }
    // Check laser eyes sequence: 0000 (only while fire aura active)
    if(checkSeq('p1', SEQ_LASER_EYES) && p1 && p1.alive && p1.fireAuraActive && (!p1.secretLaserCD || p1.secretLaserCD<=0) && !p1.laserEyesActive){
      clearSeq('p1'); activateLaserEyes(p1, p2);
    } else if(checkSeq('p2', SEQ_LASER_EYES) && p2 && p2.alive && p2.fireAuraActive && (!p2.secretLaserCD || p2.secretLaserCD<=0) && !p2.laserEyesActive){
      clearSeq('p2'); activateLaserEyes(p2, p1);
    }
  }
  // Buffer one-shot actions for online guest (so they're not lost between frames)
  if(typeof guestInputBuf!=='undefined'){
    const b1 = keyBinds.p1;
    if(e.code===b1.up) guestInputBuf.up=true;
    if(e.code===b1.down) guestInputBuf.down=true;
    if(e.code===b1.attack) guestInputBuf.attack=true;
    if(e.code===b1.dash) guestInputBuf.dash=true;
    if(e.code===b1.parry) guestInputBuf.parry=true;
    if(e.code===b1.launch) guestInputBuf.launch=true;
    if(e.code===b1.power1) guestInputBuf.power1=true;
    if(e.code===b1.power2) guestInputBuf.power2=true;
    if(e.code===b1.rage) guestInputBuf.rage=true;
  }
});
document.addEventListener('keyup', e => {
  const tag = e.target.tagName;
  if(tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  keys[e.code]=false;
});

// Touch state — P1 (single-player controls + 2P P1 half)
const ts = {up:0,down:0,left:0,right:0,attack:0,dash:0,parry:0,launch:0,power1:0,power2:0,power3:0,power4:0,rage:0};
// Touch state — P2 (2P P2 half)
const ts2 = {up:0,down:0,left:0,right:0,attack:0,dash:0,parry:0,launch:0,power1:0,power2:0,power3:0,power4:0,rage:0};

// Single-player touch controls (no data-p attribute)
document.querySelectorAll('#touch-controls .dpad-btn').forEach(b => {
  const d = b.dataset.dir;
  b.addEventListener('touchstart', e => { e.preventDefault(); ts[d]=1;
    if(typeof guestInputBuf!=='undefined' && (d==='up')) guestInputBuf.up=true;
  }, {passive:false});
  b.addEventListener('touchend',   e => { e.preventDefault(); ts[d]=0; }, {passive:false});
});
document.querySelectorAll('#touch-controls .abtn').forEach(b => {
  const a = b.dataset.action;
  b.addEventListener('touchstart', e => { e.preventDefault(); ts[a]=1;
    if(typeof guestInputBuf!=='undefined') guestInputBuf[a]=true;
  }, {passive:false});
  b.addEventListener('touchend',   e => { e.preventDefault(); ts[a]=0; }, {passive:false});
});

// 2-Player touch controls (data-p="1" or data-p="2")
document.querySelectorAll('#touch-2p [data-p="1"].dpad-btn').forEach(b => {
  const d = b.dataset.dir;
  b.addEventListener('touchstart', e => { e.preventDefault(); ts[d]=1; }, {passive:false});
  b.addEventListener('touchend',   e => { e.preventDefault(); ts[d]=0; }, {passive:false});
});
document.querySelectorAll('#touch-2p [data-p="1"].abtn').forEach(b => {
  const a = b.dataset.action;
  b.addEventListener('touchstart', e => { e.preventDefault(); ts[a]=1; }, {passive:false});
  b.addEventListener('touchend',   e => { e.preventDefault(); ts[a]=0; }, {passive:false});
});
document.querySelectorAll('#touch-2p [data-p="2"].dpad-btn').forEach(b => {
  const d = b.dataset.dir;
  b.addEventListener('touchstart', e => { e.preventDefault(); ts2[d]=1; }, {passive:false});
  b.addEventListener('touchend',   e => { e.preventDefault(); ts2[d]=0; }, {passive:false});
});
document.querySelectorAll('#touch-2p [data-p="2"].abtn').forEach(b => {
  const a = b.dataset.action;
  b.addEventListener('touchstart', e => { e.preventDefault(); ts2[a]=1; }, {passive:false});
  b.addEventListener('touchend',   e => { e.preventDefault(); ts2[a]=0; }, {passive:false});
});

// Show/hide correct touch controls based on mode
function showTouchControls(is2P){
  const tc = document.getElementById('touch-controls');
  const t2p = document.getElementById('touch-2p');
  const isTouch = window.matchMedia('(pointer:coarse)').matches;
  if(!isTouch){ tc.style.display='none'; t2p.classList.remove('active'); return; }
  if(is2P){
    tc.style.display='none';
    t2p.classList.add('active');
  } else {
    tc.style.display='flex';
    t2p.classList.remove('active');
  }
}
function hideTouchControls(){
  document.getElementById('touch-controls').style.display='none';
  document.getElementById('touch-2p').classList.remove('active');
}

// ─── MYSTERY BOX ───
let mysteryBox = null;
function spawnMysteryBox(){
  if(mysteryBox) return;
  mysteryBox = {
    x: rand(200, AW-200),
    y: FLOOR_Y - 80,
    size: 60,
    rot: 0,
    pulse: 0,
    glow: 0,
    alive: true,
  };
}
function updateMysteryBox(dt){
  if(!mysteryBox) return;
  mysteryBox.rot += dt * 1.5;
  mysteryBox.pulse += dt * 4;
  mysteryBox.glow = 0.6 + Math.sin(mysteryBox.pulse)*0.3;
}
function drawMysteryBox(){
  if(!mysteryBox) return;
  const {x,y,size,rot,glow} = mysteryBox;
  ctx.save();
  ctx.translate(x,y);
  ctx.rotate(rot * 0.3);
  // Box shadow
  if(!PERF_LOW){ctx.shadowColor = '#ffd740';
  ctx.shadowBlur = 20 * glow;}
  // Gold box
  if(PERF_LOW){
    ctx.fillStyle='#ffd740';
  } else {
    const bg = ctx.createLinearGradient(-size/2,-size/2,size/2,size/2);
    bg.addColorStop(0,'#ffd740');
    bg.addColorStop(0.5,'#ff9100');
    bg.addColorStop(1,'#ffd740');
    ctx.fillStyle = bg;
  }
  ctx.beginPath();
  ctx.roundRect(-size/2,-size/2,size,size,8);
  ctx.fill();
  // ? mark
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#1a1a2e';
  ctx.font = `bold ${size*0.6}px Fredoka,sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', 0, 2);
  // sparkles
  for(let i=0;i<4;i++){
    const sa = mysteryBox.pulse*0.5+i*1.57;
    ctx.save();
    ctx.translate(Math.cos(sa)*(size*0.8), Math.sin(sa)*(size*0.7)-size*0.1);
    ctx.fillStyle = `rgba(255,215,64,${glow})`;
    ctx.beginPath();
    ctx.arc(0,0,3,0,TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}
function checkMysteryPickup(c, o){
  if(!mysteryBox) return;
  if(dist(c.x+c.w/2, c.y+c.h/2, mysteryBox.x, mysteryBox.y) < 90){
    // Give random power
    const effect = pick(['speed','shield','double','heal']);
    mysteryBox = null;
    sfxMystery();
    /* playSpecialVideo('mystery', 2000); */
    applyMysteryEffect(c, o, effect);
  }
}
function applyMysteryEffect(c, o, effect){
  if(effect === 'speed'){
    c.speedBoost = 1.5;
    c.speedBoostT = 5;
    fText(c.x+c.w/2, c.y-60, 'SPEED BOOST!', '#4ade80', 32, 1.5);
    slam('SPEED BOOST!!', '#4ade80', 1.2);
  } else if(effect === 'shield'){
    c.shieldActive = true;
    fText(c.x+c.w/2, c.y-60, 'SHIELDED!', '#60a5fa', 32, 1.5);
    slam('SHIELD UP!!', '#60a5fa', 1.2);
  } else if(effect === 'double'){
    c.doubleDmg = true;
    fText(c.x+c.w/2, c.y-60, 'DOUBLE DMG!', '#f472b6', 32, 1.5);
    slam('DOUBLE DAMAGE!!', '#f472b6', 1.2);
  } else if(effect === 'heal'){
    c.hp = Math.min(MAX_HP, c.hp+1);
    fText(c.x+c.w/2, c.y-60, '+1 HP!', '#4ade80', 32, 1.5);
    slam('HEALED!!', '#4ade80', 1.2);
    stars(c.x+c.w/2, c.y, 15);
  }
}

// ─── PROJECTILES ───
const projectiles = [];
function spawnPillow(owner, face, isDouble, isBig){
  const px = owner.x + owner.w/2 + face*80;
  const py = owner.y + owner.h*0.35;
  const sz = isBig ? PILLOW_SIZE * 1.8 : PILLOW_SIZE;
  projectiles.push({
    x: px, y: py, vx: face*LAUNCH_SPD*(isBig?0.7:1), vy: -50,
    w: sz, h: sz*0.7,
    owner, face, alive: true, rot: 0, trail: [],
    type: 'pillow', isDouble: !!isDouble, isBig: !!isBig,
  });
  sfxLaunch();
  feathers(px, py, isBig ? 20 : 10, '#fff');
}
function spawnFreezeBall(owner, face){
  const px = owner.x + owner.w/2 + face*80;
  const py = owner.y + owner.h*0.3;
  projectiles.push({
    x: px, y: py, vx: face*480, vy: -20,
    w: 50, h: 50,
    owner, face, alive: true, rot: 0, trail: [],
    type: 'freeze',
  });
  sfxFreeze();
}
function spawnSaxWave(owner, face){
  const px = owner.x + owner.w/2 + face*80;
  const py = owner.y + owner.h*0.4;
  projectiles.push({
    x: px, y: py, vx: face*550, vy: 0,
    w: 80, h: 90,
    owner, face, alive: true, rot: 0, trail: [],
    type: 'sax',
  });
  sfxSax();
}

// ─── NEW PROJECTILE SPAWNERS ───
function spawnShotgunPillows(owner, face){
  sfxShotgun();
  const cx = owner.x + owner.w/2 + face*80;
  const cy = owner.y + owner.h*0.35;
  const angles = [-0.35, -0.17, 0, 0.17, 0.35]; // 5-way spread
  angles.forEach((a,i) => {
    const spd = 550 + rand(-30,30);
    projectiles.push({
      x: cx, y: cy + i*4 - 8,
      vx: Math.cos(a)*spd*face, vy: Math.sin(a)*spd - 30,
      w: 36, h: 28,
      owner, face, alive: true, rot: rand(0,TAU), trail: [],
      type: 'pillow_mini', isDouble: false,
    });
  });
  feathers(cx, cy, 18, '#ffd740');
  owner.squash=0.7; owner.stretch=1.4;
}

function spawnBoomerangPillow(owner, face){
  sfxBoomerang();
  const px = owner.x + owner.w/2 + face*80;
  const py = owner.y + owner.h*0.3;
  projectiles.push({
    x: px, y: py, vx: face*600, vy: -60,
    w: 52, h: 40,
    owner, face, alive: true, rot: 0, trail: [],
    type: 'boomerang',
    _boomPhase: 0, _boomOriginX: px, _boomFace: face,
  });
  feathers(px, py, 8, '#a78bfa');
  owner.squash=0.8; owner.stretch=1.25;
}

function spawnRapidFirePillows(owner, face){
  sfxRapidFire();
  for(let i=0;i<6;i++){
    setTimeout(()=>{
      if(!owner.alive) return;
      const px = owner.x + owner.w/2 + face*70;
      const py = owner.y + owner.h*0.3 + rand(-25,25);
      projectiles.push({
        x: px, y: py,
        vx: face*(650+rand(-50,50)), vy: rand(-60,30),
        w: 30, h: 22,
        owner, face, alive: true, rot: rand(0,TAU), trail: [],
        type: 'pillow_mini', isDouble: false,
      });
      feathers(px, py, 3, '#fff');
    }, i*55);
  }
  owner.squash=1.2; owner.stretch=0.85;
}

function doPillowUppercut(attacker, victim){
  sfxUppercut();
  const adx = Math.abs((attacker.x+attacker.w/2) - (victim.x+victim.w/2));
  const ady = Math.abs((attacker.y+attacker.h/2) - (victim.y+victim.h/2));
  if(adx < 220 && ady < 250 && victim.alive && !victim.launched){
    // Direct sky-launch
    victim.launched = true;
    victim.launchVy = -680;
    victim.launchVx = attacker.face * 80;
    victim.launchSpin = attacker.face * 8;
    victim.launchRot = 0;
    victim.launchTimer = 0;
    victim.launchIsKO = false;
    victim.grounded = false;
    victim.hitFlash = 0.3;
    victim.hp = Math.max(0, victim.hp - 1);
    attacker.combo++; attacker.comboT=2; attacker.hits++;
    if(attacker.combo>attacker.maxCombo) attacker.maxCombo=attacker.combo;
    hitStop(0.18); addTrauma(0.7);
    screenFlash('rgba(255,150,0,.4)',0.15);
    feathers(victim.x+victim.w/2, victim.y, 30, '#fff');
    sparks(victim.x+victim.w/2, victim.y+victim.h/2, 25, '#ff9100');
    shockwave(victim.x+victim.w/2, victim.y+victim.h/2, 'rgba(255,150,0,.7)');
    fText(victim.x+victim.w/2, victim.y-60, 'UPPERCUT!!', '#ff9100', 40, 1.8);
    slam('PILLOW UPPERCUT!!','#ff9100',1.5);
    bloomInt=0.7; chromAb=0.5;
    if(victim.hp <= 0){
      victim.launchIsKO = true;
      slowMo(SLO_DUR+0.5, SLO_SCALE);
      playNarr(narrKO);
    } else {
      slowMo(0.4, 0.2);
    }
  } else {
    // Whiffed — still animate
    fText(attacker.x+attacker.w/2, attacker.y-60, 'UPPERCUT!', '#ff9100', 30, 0.8);
    sparks(attacker.x+attacker.w/2+attacker.face*100, attacker.y+attacker.h*0.3, 12, '#ff9100');
  }
  attacker.squash=0.6; attacker.stretch=1.5;
  attacker.atkAnim=1.0; attacker.atk=true; attacker.atkT=ATK_TOTAL;
  attacker._hitChecked=true; // skip normal hit check
}

const SHOTGUN_WORDS = ['SPREAD!!','BUCKSHOT!!','SCATTER!!','FAN OUT!!','BLAST!!'];
const UPPERCUT_WORDS = ['UPPERCUT!!','RISING!!','SKY HIGH!!','LAUNCHED!!','GOING UP!!'];
const BOOMERANG_WORDS = ['BOOMERANG!!','RETURNS!!','CATCH THIS!!','ROUND TRIP!!'];
const RAPIDFIRE_WORDS = ['RAPID FIRE!!','BARRAGE!!','VOLLEY!!','MINIGUN!!','SUPPRESSION!!'];
const MINI_PILLOW_WORDS = ['PELTED!!','PLINK!!','FLICK!!','TAP!!','NIP!!'];

// ─── MINI PILLOW HIT (from shotgun/rapidfire) ───
function miniPillowHit(attacker, victim, dir){
  if(victim.shieldActive){
    victim.shieldActive = false;
    sfxParry();
    fText(victim.x+victim.w/2, victim.y-60, 'BLOCKED!', '#60a5fa', 28, 0.8);
    sparks(victim.x+victim.w/2, victim.y+victim.h/2, 10, '#60a5fa');
    return;
  }
  victim.hp = Math.max(0, victim.hp - 1);
  victim.hitFlash = 0.15;
  victim.hitRecoil = dir * 0.2;
  victim.vx = dir * 180;
  victim.vy = -80;
  victim.grounded = false;
  attacker.combo++; attacker.comboT=1.5; attacker.hits++;
  if(attacker.combo>attacker.maxCombo) attacker.maxCombo=attacker.combo;

  hitStop(0.06); addTrauma(0.25);
  sfxHit(attacker.combo);
  feathers(victim.x+victim.w/2, victim.y+victim.h/2, 6, '#fff');
  sparks(victim.x+victim.w/2, victim.y+victim.h/2, 8, '#ffd740');
  fText(victim.x+victim.w/2+rand(-20,20), victim.y-30, pick(MINI_PILLOW_WORDS), '#ffd740', 22, 0.7);
  screenFlash('rgba(255,215,64,.12)',0.05);

  if(victim.hp <= 0){
    victim.launched = true;
    victim.launchVy = -420;
    victim.launchVx = dir * 100;
    victim.launchSpin = dir * 5;
    victim.launchRot = 0;
    victim.launchTimer = 0;
    victim.launchIsKO = true;
    victim.grounded = false;
    slowMo(SLO_DUR+0.3, SLO_SCALE);
    playNarr(narrKO);
  }
  slam(`-1 HP! (${victim.hp}/${MAX_HP})`, '#ffd740', 0.8);
  if(COMBO_MS[attacker.combo]){
    setTimeout(()=>{ slam(COMBO_MS[attacker.combo],'#ffd740',1); sfxCombo(attacker.combo); stars(attacker.x+attacker.w/2,attacker.y,10); }, 300);
  }
}

// ─── BOOMERANG HIT ───
function boomerangHit(attacker, victim, dir){
  if(victim.shieldActive){
    victim.shieldActive = false;
    sfxParry();
    fText(victim.x+victim.w/2, victim.y-60, 'BLOCKED!', '#60a5fa', 30, 1.0);
    sparks(victim.x+victim.w/2, victim.y+victim.h/2, 15, '#60a5fa');
    shockwave(victim.x+victim.w/2, victim.y+victim.h/2, 'rgba(96,165,250,0.5)');
    return;
  }
  victim.hp = Math.max(0, victim.hp - 1);
  victim.hitFlash = 0.2;
  victim.hitRecoil = dir * 0.3;
  // Boomerang dizzy effect (shorter than sax)
  victim.dizzy = true;
  victim.dizzyT = 1.2;
  victim.dizzyAngle = 0;
  victim.vx = dir * 220;
  victim.vy = -120;
  victim.grounded = false;
  attacker.combo++; attacker.comboT=2; attacker.hits++;
  if(attacker.combo>attacker.maxCombo) attacker.maxCombo=attacker.combo;

  hitStop(0.12); addTrauma(0.5);
  sfxHit(attacker.combo);
  feathers(victim.x+victim.w/2, victim.y+victim.h/2, 20, '#c4b5fd');
  sparks(victim.x+victim.w/2, victim.y+victim.h/2, 18, '#a78bfa');
  shockwave(victim.x+victim.w/2, victim.y+victim.h/2, 'rgba(167,139,250,.6)');
  fText(victim.x+victim.w/2, victim.y-50, pick(BOOMERANG_WORDS), '#a78bfa', 34, 1.4);
  screenFlash('rgba(167,139,250,.2)',0.1);
  bloomInt=0.5; chromAb=0.3;

  if(victim.hp <= 0){
    victim.launched = true;
    victim.launchVy = -500;
    victim.launchVx = dir * 120;
    victim.launchSpin = dir * 6;
    victim.launchRot = 0;
    victim.launchTimer = 0;
    victim.launchIsKO = true;
    victim.grounded = false;
    slowMo(SLO_DUR+0.5, SLO_SCALE);
    playNarr(narrKO);
  } else {
    slowMo(0.3, 0.25);
  }
  slam(`BOOMERANG! -1 HP! (${victim.hp}/${MAX_HP})`, '#a78bfa', 1.2);
  /* playSpecialVideo('boomerang', 1800); */
}

function updateAllProjectiles(dt){
  for(let i = projectiles.length-1; i>=0; i--){
    const p = projectiles[i];
    const target = p.owner === p1 ? p2 : p1;

    // ─── BOOMERANG PHYSICS ───
    if(p.type === 'boomerang'){
      p._boomPhase += dt;
      const turnT = 0.35; // start curving back after this
      if(p._boomPhase > turnT){
        // Decelerate then reverse
        const rev = (p._boomPhase - turnT) * 4.5;
        p.vx = p._boomFace * (600 - rev * 900);
        p.vy = Math.sin(p._boomPhase * 5) * 120; // wavy path
      }
      p.rot += 18 * dt; // fast spin
    } else {
      // Normal gravity
      if(p.type === 'pillow') p.vy += 80*dt;
      else if(p.type === 'pillow_mini') p.vy += 110*dt;
      else if(p.type === 'freeze') p.vy += 30*dt;
      p.rot += p.face * 12 * dt;
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    p.trail.push({x:p.x, y:p.y, life:0.35});
    if(p.trail.length > 18) p.trail.shift();
    for(let t=p.trail.length-1; t>=0; t--){ p.trail[t].life-=dt; if(p.trail[t].life<=0) p.trail.splice(t,1); }

    // Particle trails
    if(p.type === 'pillow' && p.isInferno && Math.random()<dt*25) embers(p.x,p.y,3,Math.random()>.4?'#ff4400':'#ffd740');
    else if(p.type === 'pillow' && Math.random()<dt*15) feathers(p.x,p.y,1,'#fff');
    if(p.type === 'pillow_mini' && Math.random()<dt*10) feathers(p.x,p.y,1,'#ffd740');
    if(p.type === 'boomerang' && Math.random()<dt*18) em(p.x,p.y,rand(-40,40),rand(-40,40),0.25,'#a78bfa',rand(3,6),'star');
    if(p.type === 'freeze' && Math.random()<dt*12) em(p.x,p.y,rand(-30,30),rand(-30,30),0.3,'#93c5fd',rand(3,7),'star');
    if(p.type === 'sax'   && Math.random()<dt*20) em(p.x+rand(-30,30),p.y+rand(-20,20),rand(-50,50),rand(-80,0),0.5,'#ffd740',rand(5,12),'star');

    // ─── IMPACT ANIMATION STATE ───
    if(p.impacting){
      p.impactT -= dt;
      p.impactScale = 1 + (1 - p.impactT/p.impactDur) * 1.2; // expand
      p.impactAlpha = Math.max(0, p.impactT/p.impactDur); // fade out
      if(p.impactT <= 0){ projectiles.splice(i,1); }
      continue;
    }

    // Hit check — hitboxes per type
    let hw, hh;
    if(p.type==='sax'){ hw=100; hh=100; }
    else if(p.type==='freeze'){ hw=70; hh=70; }
    else if(p.type==='pillow_mini'){ hw=50; hh=55; }
    else if(p.type==='boomerang'){ hw=60; hh=55; }
    else { hw=65; hh=70; } // pillow (normal)

    if(p.alive && target.alive && !target.launched &&
       Math.abs(p.x - (target.x+target.w/2)) < hw &&
       Math.abs(p.y - (target.y+target.h/2)) < hh){
      p.alive = false;
      // Stop projectile at impact point and start impact animation
      p.vx = 0; p.vy = 0;
      p.impacting = true;
      p.impactT = 0.25; // 250ms impact animation
      p.impactDur = 0.25;
      p.impactScale = 1;
      p.impactAlpha = 1;
      // Burst particles at impact
      const impactColors = {
        pillow:'#fff', pillow_mini:'#ffd740', freeze:'#93c5fd',
        sax:'#ffd740', boomerang:'#a78bfa'
      };
      const ic = impactColors[p.type]||'#fff';
      sparks(p.x, p.y, 8, ic);
      feathers(p.x, p.y, 6, ic);
      // Call hit handler
      if(p.type === 'pillow') pillowHit(p.owner, target, p.face, p.isDouble, p.isInferno);
      else if(p.type === 'pillow_mini') miniPillowHit(p.owner, target, p.face);
      else if(p.type === 'boomerang') boomerangHit(p.owner, target, p.face);
      else if(p.type === 'freeze') freezeHit(p.owner, target);
      else if(p.type === 'sax') saxHit(p.owner, target, p.face);
      continue;
    }

    // Boomerang returns past owner — despawn
    if(p.type === 'boomerang' && p._boomPhase > 0.7){
      const ownerCX = p.owner.x + p.owner.w/2;
      if((p._boomFace > 0 && p.x < ownerCX - 60) || (p._boomFace < 0 && p.x > ownerCX + 60)){
        projectiles.splice(i,1); continue;
      }
    }

    if(p.x < -150 || p.x > AW+150 || p.y > AH+100){ projectiles.splice(i,1); continue; }
    if(!p.alive){ projectiles.splice(i,1); }
  }
}
function drawProjectiles(){
  for(const p of projectiles){
    // Trail
    for(const t of p.trail){
      const a = clamp(t.life/0.35,0,1)*0.35;
      ctx.save(); ctx.globalAlpha = a;
      const tc = p.type==='freeze'?'#93c5fd': p.type==='sax'?'#ffd740':'#fff';
      ctx.fillStyle = tc; if(!PERF_LOW){ctx.shadowColor = tc; ctx.shadowBlur = 10;}
      ctx.beginPath(); ctx.arc(t.x,t.y,p.type==='sax'?12:8,0,TAU); ctx.fill();
      ctx.shadowBlur=0; ctx.restore();
    }

    ctx.save();
    ctx.translate(p.x, p.y);

    // Impact animation — expand, flash, and fade
    if(p.impacting){
      const s = p.impactScale||1;
      const a = p.impactAlpha||0;
      ctx.globalAlpha = a;
      ctx.scale(s, s);
      // Impact burst ring
      const ringColor = p.type==='freeze'?'#93c5fd':p.type==='sax'?'#ffd740':p.type==='boomerang'?'#a78bfa':'#fff';
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = 3 * a;
      if(!PERF_LOW){ctx.shadowColor = ringColor; ctx.shadowBlur = 20 * a;}
      ctx.beginPath(); ctx.arc(0, 0, 30*s, 0, TAU); ctx.stroke();
      // Inner flash
      ctx.fillStyle = ringColor;
      ctx.globalAlpha = a * 0.5;
      ctx.beginPath(); ctx.arc(0, 0, 15, 0, TAU); ctx.fill();
      ctx.shadowBlur=0; ctx.restore();
      continue;
    }

    ctx.rotate(p.rot);

    if(p.type === 'pillow' && p.isInferno){
      // Inferno fireball — massive blazing sphere
      const fbT = Date.now()/60;
      if(!PERF_LOW){
        ctx.shadowColor = '#ff4400'; ctx.shadowBlur = 35;
        // Outer fire corona
        const corona = ctx.createRadialGradient(0,0,p.w*0.2, 0,0,p.w*0.7);
        corona.addColorStop(0,'rgba(255,200,0,.6)');
        corona.addColorStop(0.4,'rgba(255,100,0,.4)');
        corona.addColorStop(1,'rgba(255,30,0,0)');
        ctx.fillStyle=corona;
        ctx.beginPath();ctx.arc(0,0,p.w*0.7,0,TAU);ctx.fill();
      }
      // Core fireball
      ctx.fillStyle = '#ffd740';
      ctx.beginPath(); ctx.arc(0,0,p.w*0.32,0,TAU); ctx.fill();
      ctx.fillStyle = '#ff6a00';
      ctx.beginPath(); ctx.arc(0,0,p.w*0.42,0,TAU); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = 0.4 + Math.sin(fbT*5)*0.2;
      ctx.beginPath(); ctx.arc(-4,-4,p.w*0.18,0,TAU); ctx.fill();
      ctx.globalAlpha = 1;
      // Flame licks around the ball
      for(let fl=0;fl<(PERF_LOW?3:6);fl++){
        const fa = (fl/6)*TAU + fbT*2;
        const fr = p.w*0.38 + Math.sin(fbT*4+fl*2)*6;
        const flx = Math.cos(fa)*fr, fly = Math.sin(fa)*fr;
        ctx.fillStyle = fl%2===0?'#ff3300':'#ffd740';
        ctx.globalAlpha = 0.6;
        ctx.beginPath();ctx.arc(flx,fly,4+Math.sin(fbT*3+fl)*2,0,TAU);ctx.fill();
      }
      ctx.globalAlpha=1;
    } else if(p.type === 'pillow'){
      if(!PERF_LOW){ctx.shadowColor = '#ffd740'; ctx.shadowBlur = 18;}
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(0,0,p.w/2,p.h/2,0,0,TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,215,64,.3)';
      ctx.beginPath(); ctx.ellipse(-4,-4,p.w/3,p.h/3,0,0,TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(200,180,150,.4)'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(-p.w/3,0); ctx.lineTo(p.w/3,0); ctx.stroke();
    } else if(p.type === 'pillow_mini'){
      // Small bright pillow pellet
      if(!PERF_LOW){ctx.shadowColor = '#ffd740'; ctx.shadowBlur = 12;}
      ctx.fillStyle = '#fffbe6';
      ctx.beginPath(); ctx.ellipse(0,0,p.w/2,p.h/2,0,0,TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,215,64,.5)';
      ctx.beginPath(); ctx.ellipse(0,0,p.w/3,p.h/3,0,0,TAU); ctx.fill();
      // Speed lines
      ctx.strokeStyle='rgba(255,255,200,.4)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(-p.w/2-6,0); ctx.lineTo(-p.w/2-18,0); ctx.stroke();
    } else if(p.type === 'boomerang'){
      // Glowing purple boomerang shape
      if(!PERF_LOW){ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 22;}
      ctx.fillStyle = '#c4b5fd';
      ctx.strokeStyle = '#7c3aed'; ctx.lineWidth = 3;
      // Boomerang V-shape
      ctx.beginPath();
      ctx.moveTo(0, -p.h/2);
      ctx.quadraticCurveTo(p.w/2, -p.h/4, p.w/3, p.h/4);
      ctx.lineTo(0, 0);
      ctx.lineTo(-p.w/3, p.h/4);
      ctx.quadraticCurveTo(-p.w/2, -p.h/4, 0, -p.h/2);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      // Inner glow
      ctx.fillStyle = 'rgba(167,139,250,.5)';
      ctx.beginPath(); ctx.arc(0,-4,8,0,TAU); ctx.fill();
    } else if(p.type === 'freeze'){
      if(!PERF_LOW){ctx.shadowColor = '#93c5fd'; ctx.shadowBlur = 25;
      const bg = ctx.createRadialGradient(0,0,5,0,0,26);
      bg.addColorStop(0,'#e0f2fe'); bg.addColorStop(1,'#3b82f6');
      ctx.fillStyle = bg;
      } else { ctx.fillStyle='#3b82f6'; }
      ctx.beginPath(); ctx.arc(0,0,25,0,TAU); ctx.fill();
      // ice crystals
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth=2;
      for(let i=0;i<6;i++){ const a=i*Math.PI/3; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(Math.cos(a)*20,Math.sin(a)*20); ctx.stroke(); }
    } else if(p.type === 'sax'){
      if(!PERF_LOW){ctx.shadowColor = '#ffd740'; ctx.shadowBlur = 30;
      const bg2 = ctx.createRadialGradient(0,0,10,0,0,45);
      bg2.addColorStop(0,'rgba(255,215,64,0.9)'); bg2.addColorStop(1,'rgba(255,150,0,0.4)');
      ctx.fillStyle = bg2;
      } else { ctx.fillStyle='rgba(255,215,64,0.8)'; }
      ctx.beginPath(); ctx.ellipse(0,0,45,35,0,0,TAU); ctx.fill();
      // Musical note
      ctx.fillStyle = '#1a1a2e';
      ctx.font = '30px serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('♪', 0, 2);
    }

    ctx.shadowBlur=0; ctx.restore();
  }
}

// ─── PILLOW HIT ───
function pillowHit(attacker, victim, dir, isDouble, isInferno){
  if(victim.shieldActive){
    victim.shieldActive = false;
    sfxParry();
    fText(victim.x+victim.w/2, victim.y-60, 'BLOCKED!', '#60a5fa', 32, 1.2);
    sparks(victim.x+victim.w/2, victim.y+victim.h/2, 20, '#60a5fa');
    shockwave(victim.x+victim.w/2, victim.y+victim.h/2, 'rgba(96,165,250,0.6)');
    return;
  }
  const dmg = isInferno ? 5 : (isDouble ? 2 : 1);
  victim.hp = Math.max(0, victim.hp - dmg);
  if(attacker.doubleDmg){ attacker.doubleDmg=false; }

  victim.launched = true;
  victim.launchVy = -520;
  victim.launchVx = dir*140;
  victim.launchSpin = dir*6;
  victim.launchRot = 0;
  victim.launchTimer = 0;
  victim.launchIsKO = false;
  victim.grounded = false;
  victim.hitFlash = 0.25;

  attacker.combo++;
  attacker.comboT = 2;
  attacker.hits++;
  if(attacker.combo > attacker.maxCombo) attacker.maxCombo = attacker.combo;

  hitStop(HS_LAUNCH);
  addTrauma(0.65);
  sfxLaunchHit(); sfxFlyUp();
  screenFlash('rgba(255,215,64,.35)', 0.15);
  feathers(victim.x+victim.w/2, victim.y+victim.h/2, 35, '#fff');
  sparks(victim.x+victim.w/2, victim.y+victim.h/2, 20, '#ffd740');
  shockwave(victim.x+victim.w/2, victim.y+victim.h/2, 'rgba(255,200,0,.6)');
  fText(victim.x+victim.w/2, victim.y-50, pick(LAUNCH_HIT_WORDS), '#ffd740', 36, 1.6);
  bloomInt=0.6; chromAb=0.5;

  if(victim.hp <= 0){
    victim.launchIsKO = true;
    slowMo(SLO_DUR+0.5, SLO_SCALE);
    playNarr(narrKO);
  } else {
    slowMo(0.5, 0.2);
  }

  // Pillow-launch video on every projectile hit
  /* playSpecialVideo('pillow', 1800); */

  // Inferno fireball: massive explosion on impact
  if(isInferno){
    const vx = victim.x+victim.w/2, vy = victim.y+victim.h/2;
    embers(vx, vy, 60, '#ff4400');
    sparks(vx, vy, 40, '#ffd740');
    feathers(vx, vy, 30, '#ff6a00');
    shockwave(vx, vy, 'rgba(255,68,0,.8)');
    shockwave(vx, vy, 'rgba(255,200,0,.5)');
    screenFlash('rgba(255,60,0,0.45)', 0.3);
    addTrauma(0.9);
    bloomInt = 1.0;
    chromAb = 0.7;
    slam(`☄️ -${dmg} HP!! INCINERATED!!`, '#ff4400', 2);
    hostSendEvent({type:'slam', text:`☄️ -${dmg} HP!! INCINERATED!!`, color:'#ff4400', dur:2});
  } else {
    slam(`-${dmg} HP! (${victim.hp}/${MAX_HP})`, isDouble?'#f472b6':'#ff3d00', 1.2);
  }
  if(COMBO_MS[attacker.combo]){
    setTimeout(()=>{ slam(COMBO_MS[attacker.combo],'#ffd740',1); sfxCombo(attacker.combo); stars(attacker.x+attacker.w/2,attacker.y,10);
      /* playSpecialVideo('combo', 1800); */
    }, 400);
  }
}

// ─── FREEZE HIT ───
function freezeHit(attacker, victim){
  if(victim.frozen) return;
  if(victim.shieldActive){ victim.shieldActive=false; fText(victim.x+victim.w/2,victim.y-60,'BLOCKED!','#60a5fa',30,1.2); return; }
  victim.frozen = true;
  victim.frozenT = 3.0;
  victim.frozenCracks = 0;
  sfxFreeze();
  /* playSpecialVideo('freeze', 2500); */
  slam('FROZEN!!', '#93c5fd', 1.5);
  addTrauma(0.5);
  screenFlash('rgba(147,197,253,.35)', 0.2);
  fText(victim.x+victim.w/2, victim.y-60, 'FROZEN!', '#93c5fd', 38, 2);
  for(let i=0;i<20;i++) em(victim.x+victim.w/2+rand(-30,30), victim.y+victim.h/2+rand(-50,50), rand(-60,60), rand(-80,80), 0.8, '#e0f2fe', rand(4,9),'star');
}

// ─── SAX HIT ───
function saxHit(attacker, victim, dir){
  if(victim.shieldActive){ victim.shieldActive=false; fText(victim.x+victim.w/2,victim.y-60,'BLOCKED!','#60a5fa',30,1.2); return; }
  victim.vx = dir*500;
  victim.vy = KB_UP * 0.8;
  victim.grounded = false;
  victim.dizzy = true;
  victim.dizzyT = 2.0;
  victim.dizzyAngle = 0;
  sfxSax();
  /* playSpecialVideo('sax', 2500); */
  slam('WOOZY!!', '#ffd740', 1.2);
  addTrauma(0.55);
  screenFlash('rgba(255,215,64,.3)', 0.15);
  fText(victim.x+victim.w/2, victim.y-60, 'DIZZIED!', '#ffd740', 34, 1.5);
  for(let i=0;i<25;i++) em(victim.x+victim.w/2+rand(-40,40),victim.y+victim.h/2+rand(-60,60),rand(-120,120),rand(-100,-20),0.7,'#ffd740',rand(5,10),'star');
}

// ─── LIGHTNING STRIKE ───
function doLightningStrike(attacker, victim){
  /* playSpecialVideo('lightning', 2500); */
  sfxLightning();
  // Draw clouds
  attacker.lightningCloud = 0.8;
  // Delayed strike
  setTimeout(()=>{
    if(!victim.alive) return;
    addTrauma(1.0);
    hitStop(0.25);
    screenFlash('rgba(255,255,200,.6)', 0.25);
    slam('LIGHTNING!!', '#ffd740', 1.5);
    // Draw bolt from top
    const tx = victim.x + victim.w/2;
    for(let i=0;i<6;i++) lightningBolt(tx+rand(-20,20), 0, tx+rand(-20,20), victim.y);
    sparks(tx, victim.y+victim.h/2, 40, '#ffd740');
    embers(tx, victim.y+victim.h/2, 20, '#ffff00');
    shockwave(tx, victim.y+victim.h/2, 'rgba(255,215,64,.8)');
    fText(tx, victim.y-50, 'ZAP!', '#ffd740', 40, 1.5);
    chromAb=0.7; bloomInt=1.0;
    if(!victim.frozen && !victim.launched && victim.alive){
      victim.hp = Math.max(0, victim.hp-1);
      victim.hitFlash = 0.3;
      victim.stunned = true;
      victim.stunT = 0.5;
      slam(`LIGHTNING! -1 HP! (${victim.hp}/${MAX_HP})`, '#ffd740', 1.5);
      if(victim.hp <= 0){
        victim.launched = true;
        victim.launchVy = -400;
        victim.launchVx = (victim.x < AW/2 ? -1 : 1)*80;
        victim.launchSpin = 5;
        victim.launchRot = 0;
        victim.launchTimer = 0;
        victim.launchIsKO = true;
        victim.grounded = false;
        slowMo(SLO_DUR+0.5, SLO_SCALE);
        playNarr(narrKO);
      }
    }
  }, 500);
}

// ─── UPDATE LAUNCHED CROC ───
function updateLaunched(c, dt){
  // Clear freeze if character gets launched — shouldn't be frozen AND launched
  if(c.frozen){ c.frozen=false; c.frozenT=0; c.frozenCracks=0; }
  c.launchTimer += dt;
  c.launchRot += c.launchSpin * dt;
  c.x += c.launchVx * dt;
  c.y += c.launchVy * dt;
  c.launchVy += GRAVITY*0.6*dt;
  if(Math.random()<dt*8) feathers(c.x+c.w/2, c.y+c.h/2, 1, '#fff');
  c.x = clamp(c.x, 10, AW-c.w-10);

  if(c.y+c.h >= FLOOR_Y && c.launchVy > 0){
    c.y = FLOOR_Y-c.h;
    c.launched = false;
    c.launchRot = 0;
    c.grounded = true;
    c.vy = 0; c.vx = 0;
    addTrauma(0.5);
    sfxLand();
    shockwave(c.x+c.w/2, FLOOR_Y, 'rgba(255,150,0,.5)');
    feathers(c.x+c.w/2, FLOOR_Y-10, 18, '#fff');
    embers(c.x+c.w/2, FLOOR_Y-10, 10);
    screenFlash('rgba(255,100,0,.15)', 0.08);
    c.squash = 1.5; c.stretch = 0.6;
    c.stunned = true; c.stunT = 0.6;

    if(c.launchIsKO){
      c.alive = false; c.dead = true;
      c.frozen=false; c.frozenT=0; c.frozenCracks=0; // clear freeze on death
      c.deathVx = c.launchVx*0.5;
      c.deathVy = -60;
      c.deathRotV = c.launchSpin*0.3;
      c.deathRot = c.launchRot;
      hitStop(HS_KO);
      addTrauma(1);
      screenFlash('rgba(255,255,255,.5)', 0.2);
      chromAb=0.7; bloomInt=1;
      feathers(c.x+c.w/2, c.y+c.h/2, 60, '#ffd740');
      embers(c.x+c.w/2, c.y+c.h/2, 30, '#ff6b35');
      stars(c.x+c.w/2, c.y+c.h/2, 25);
      sfxKO();
      slam('K.O.!!', '#ff3d00', 2.5);
      vignette('rgba(255,60,0,.35)', 0.8);
      // Red vignette for 200ms freeze is handled by hitStop(HS_KO)
    }
    c.launchIsKO = false;
  }
}

// ─── PARTICLES ───
const P_MAX = 1500; const parts = [];
function em(x,y,vx,vy,life,col,sz,tp='rect'){if(parts.length>=P_MAX)return;parts.push({x,y,vx,vy,life,ml:life,col,sz,tp,rot:rand(0,TAU),rv:rand(-10,10),grav:1})}
function feathers(x,y,n,c='#fff'){for(let i=0;i<n;i++){const a=rand(0,TAU),s=rand(100,350);em(x,y,Math.cos(a)*s,Math.sin(a)*s-rand(60,220),rand(.6,1.6),c,rand(7,16),'feather')}}
function embers(x,y,n,c='#ff6b35'){for(let i=0;i<n;i++){const a=rand(0,TAU),s=rand(60,200);parts.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-rand(30,80),life:rand(.3,.8),ml:.8,col:c,sz:rand(2,5),tp:'ember',rot:0,rv:0,grav:.3})}}
function sparks(x,y,n,c='#fff'){for(let i=0;i<n;i++){const a=rand(0,TAU),s=rand(150,400);em(x,y,Math.cos(a)*s,Math.sin(a)*s,rand(.15,.4),c,rand(2,4),'spark')}}
function stars(x,y,n){for(let i=0;i<n;i++){const a=rand(0,TAU),s=rand(50,180);em(x,y,Math.cos(a)*s,Math.sin(a)*s,rand(.4,.9),'#ffd740',rand(6,12),'star')}}
function shockwave(x,y,c='rgba(255,255,255,.5)'){parts.push({x,y,vx:0,vy:0,life:.4,ml:.4,col:c,sz:0,tp:'ring',rot:0,rv:0,radius:10,grav:0})}
function goldenRain(x,y){for(let i=0;i<60;i++){const a=rand(-3.14,-.1),s=rand(120,450);em(x+rand(-70,70),y,Math.cos(a)*s,Math.sin(a)*s,rand(.7,1.8),'#ffd740',rand(6,13),'star')}}
function lightningBolt(x1,y1,x2,y2){parts.push({x:x1,y:y1,vx:x2,vy:y2,life:.18,ml:.18,col:'#a78bfa',sz:4,tp:'lightning',rot:0,rv:0,grav:0})}
function drawStar5(c,cx,cy,oR,iR){let r=-Math.PI/2;const st=Math.PI/5;c.beginPath();c.moveTo(cx,cy-oR);for(let i=0;i<5;i++){c.lineTo(cx+Math.cos(r)*oR,cy+Math.sin(r)*oR);r+=st;c.lineTo(cx+Math.cos(r)*iR,cy+Math.sin(r)*iR);r+=st}c.closePath();c.fill()}
function updateParts(dt){
  // Mobile: hard cap particle count
  if(PERF_LOW && parts.length > MOB_MAX_PARTS){
    parts.splice(0, parts.length - MOB_MAX_PARTS);
  }
  for(let i=parts.length-1;i>=0;i--){const p=parts[i];p.x+=p.vx*dt;p.y+=p.vy*dt;if(p.tp!=='ring'&&p.tp!=='lightning')p.vy+=400*p.grav*dt;p.rot+=p.rv*dt;p.life-=dt;if(p.tp==='ring')p.radius+=320*dt;if(p.tp==='ember'){p.sz*=.97;p.col=p.life>.4?'#ff6b35':'#ff3d00'}if(p.life<=0)parts.splice(i,1)}
}
function drawParts(){
  const len = parts.length;
  const step = PERF_LOW ? 2 : 1; // render every other particle on mobile
  for(let i=0;i<len;i+=step){
    const p=parts[i];const a=clamp(p.life/p.ml,0,1);
    ctx.save();ctx.globalAlpha=a;
    if(p.tp==='feather'){ctx.translate(p.x,p.y);ctx.rotate(p.rot);ctx.fillStyle=p.col;if(!PERF_LOW){ctx.shadowColor=p.col;ctx.shadowBlur=4;}ctx.beginPath();ctx.ellipse(0,0,p.sz,p.sz*.28,0,0,TAU);ctx.fill()}
    else if(p.tp==='star'){ctx.translate(p.x,p.y);ctx.rotate(p.rot);ctx.fillStyle=p.col;if(!PERF_LOW){ctx.shadowColor=p.col;ctx.shadowBlur=8;}drawStar5(ctx,0,0,p.sz,p.sz*.4)}
    else if(p.tp==='ring'){ctx.strokeStyle=p.col;ctx.lineWidth=3*a;if(!PERF_LOW){ctx.shadowColor=p.col;ctx.shadowBlur=12;}ctx.beginPath();ctx.arc(p.x,p.y,p.radius,0,TAU);ctx.stroke()}
    else if(p.tp==='ember'){ctx.fillStyle=p.col;if(!PERF_LOW){ctx.shadowColor=p.col;ctx.shadowBlur=10;}ctx.beginPath();ctx.arc(p.x,p.y,p.sz,0,TAU);ctx.fill()}
    else if(p.tp==='spark'){ctx.strokeStyle=p.col;ctx.lineWidth=1.5;if(!PERF_LOW){ctx.shadowColor=p.col;ctx.shadowBlur=6;}ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-p.vx*.02,p.y-p.vy*.02);ctx.stroke()}
    else if(p.tp==='lightning'){ctx.strokeStyle=p.col;ctx.lineWidth=p.sz*a;if(!PERF_LOW){ctx.shadowColor='#c4b5fd';ctx.shadowBlur=18;}ctx.beginPath();let lx=p.x,ly=p.y;const dx=p.vx-p.x,dy=p.vy-p.y;ctx.moveTo(lx,ly);const segs=PERF_LOW?5:10;for(let s=0;s<segs;s++){const t=(s+1)/segs;lx=p.x+dx*t+rand(-18,18);ly=p.y+dy*t+rand(-18,18);ctx.lineTo(lx,ly)}ctx.stroke()}
    else{const s=p.sz*a;ctx.fillStyle=p.col;ctx.translate(p.x,p.y);ctx.rotate(p.rot);ctx.fillRect(-s/2,-s/2,s,s)}
    ctx.shadowBlur=0;ctx.restore();
  }
  ctx.globalAlpha=1;
}

// ─── FLOATING TEXT ───
const floats=[];
function fText(x,y,text,col,sz,dur=0.9){floats.push({x,y,text,col,sz,life:dur,ml:dur,vy:-140,sc:2.2})}
function updateFloats(dt){for(let i=floats.length-1;i>=0;i--){const f=floats[i];f.y+=f.vy*dt;f.vy*=.94;f.life-=dt;f.sc=lerp(f.sc,1,dt*8);if(f.life<=0)floats.splice(i,1)}}
function drawFloats(){
  for(const f of floats){const a=clamp(f.life/f.ml,0,1);ctx.save();ctx.globalAlpha=a;ctx.font=`700 ${Math.round(f.sz*f.sc)}px Fredoka,sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='rgba(0,0,0,.5)';ctx.fillText(f.text,f.x+2,f.y+2);if(!PERF_LOW){ctx.shadowColor=f.col;ctx.shadowBlur=12;}ctx.fillStyle=f.col;ctx.fillText(f.text,f.x,f.y);ctx.restore()}
  ctx.globalAlpha=1;
}

// ─── SLAM TEXT ───
let slamT='',slamTm=0,slamC='#fff',slamS=3.5;
function slam(t,c='#ffd740',d=1.3){slamT=t;slamTm=d;slamC=c;slamS=3.5}
function drawSlam(dt){
  if(slamTm<=0)return;slamTm-=dt;slamS=lerp(slamS,1,dt*14);
  const a=clamp(slamTm/.35,0,1);
  ctx.save();ctx.globalAlpha=a;ctx.font=`700 ${Math.round(56*slamS)}px "Bebas Neue",sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillStyle='rgba(0,0,0,.6)';ctx.fillText(slamT,AW/2+3,AH*.36+3);
  if(!PERF_LOW){ctx.shadowColor=slamC;ctx.shadowBlur=40;}ctx.fillStyle=slamC;ctx.fillText(slamT,AW/2,AH*.36);
  ctx.shadowBlur=0;ctx.fillStyle='#fff';ctx.globalAlpha=a*.5;ctx.fillText(slamT,AW/2,AH*.36);
  ctx.restore();ctx.globalAlpha=1;
}

// ─── SCREEN SHAKE ───
let trauma=0,shX=0,shY=0,shT=0;
function addTrauma(t){trauma=clamp(trauma+t,0,1)}
function updateShake(dt){shT+=dt*22;trauma=Math.max(0,trauma-TRAUMA_DECAY*dt);const m=trauma*trauma;shX=noise1D(shT)*m*22;shY=noise1D(shT+100)*m*22}

// ─── CAMERA: ZOOM-OUT SYSTEM (bottom-anchored) ───
// When characters jump above the visible arena, the camera zooms OUT
// (reduces scale) while keeping the floor pinned at the bottom of the
// screen. When they land, it smoothly zooms back to normal.
let camY = 0; // kept at 0 — no vertical panning
let camZoom = 1; // 1 = normal, <1 = zoomed out
const CAM_ZOOM_LERP = 3.5; // smoothing speed
const CAM_ZOOM_MARGIN = 60; // extra px above character to keep visible

function updateCamera(dt){
  if(!p1 || !p2 || state === 'title') { camZoom = 1; camY = 0; return; }
  camY = 0; // never pan
  // Find the highest point any character reaches (lowest Y value)
  const highestY = Math.min(p1.y, p2.y) - CAM_ZOOM_MARGIN;
  let targetZoom = 1;
  if(highestY < 0){
    // Character is above the arena top edge (y<0).
    // We need the arena + the extra headroom to fit.
    // Total world height needed = AH + |highestY| = AH - highestY
    targetZoom = AH / (AH - highestY);
    // Clamp so we don't zoom out absurdly far
    targetZoom = Math.max(targetZoom, 0.45);
  }
  // Smooth lerp
  camZoom += (targetZoom - camZoom) * Math.min(1, CAM_ZOOM_LERP * dt);
  // Snap back to 1 when close
  if(Math.abs(camZoom - 1) < 0.002 && targetZoom === 1) camZoom = 1;
  // Update dynamic scale
  dynSc = baseSc * camZoom;
}

// ─── HIT STOP / SLOW MO ───
let hsTimer=0,smTimer=0,smScale=1;
function hitStop(d){hsTimer=Math.max(hsTimer,d)}
function slowMo(d,s){smTimer=d;smScale=s}
function timeScale(){return hsTimer>0?0:smTimer>0?smScale:1}

// ─── SCREEN FX ───
let flashC='',flashT=0,vigC='',vigT=0,chromAb=0,bloomInt=0;
function screenFlash(c,d=.08){flashC=c;flashT=d}
function vignette(c,d=.35){vigC=c;vigT=d}

// ─── SKY ABOVE ARENA (visible when camera pans up during jumps) ───
// Pre-generate star positions once for consistent sky
const SKY_STARS = [];
for(let i = 0; i < 80; i++){
  SKY_STARS.push({
    x: (i * 73.7 + 17) % AW,
    y: -(20 + (i * 41.3 + 7) % 280),   // negative Y = above the arena
    r: 0.4 + (i * 0.37 % 1.6),          // radius 0.4–2.0
    speed: 0.4 + (i * 0.11 % 0.8),      // twinkle speed
    phase: i * 1.7,                       // twinkle phase offset
    bright: 0.3 + (i * 0.013 % 0.7),    // base brightness
  });
}

function drawSkyAbove(t){
  // Only draw if zoomed out (characters jumping above arena)
  if(camZoom > 0.995) return;
  ctx.save();
  // Night sky gradient above the arena (negative Y region)
  // Height scales with how far we're zoomed out
  const skyH = AH * (1/camZoom - 1) + 80; // enough to cover exposed area
  if(PERF_LOW){
    ctx.fillStyle='#050510';ctx.fillRect(0,-skyH,AW,skyH);
  } else {
    const skyG = ctx.createLinearGradient(0, -skyH, 0, 0);
    skyG.addColorStop(0, '#020408');
    skyG.addColorStop(0.4, '#040a14');
    skyG.addColorStop(0.85, '#050510');
    skyG.addColorStop(1, '#050510');
    ctx.fillStyle = skyG;
    ctx.fillRect(0, -skyH, AW, skyH);
  }

  // Moon (crescent) — upper right
  const moonX = AW * 0.78, moonY = -skyH * 0.45, moonR = 28;
  // Soft glow halo (skip on mobile — expensive radial gradient)
  if(!PERF_LOW){
    ctx.globalAlpha = 0.12;
    const haloG = ctx.createRadialGradient(moonX, moonY, moonR * 0.5, moonX, moonY, moonR * 4);
    haloG.addColorStop(0, 'rgba(180,210,255,.4)');
    haloG.addColorStop(0.5, 'rgba(120,160,220,.1)');
    haloG.addColorStop(1, 'transparent');
    ctx.fillStyle = haloG;
    ctx.beginPath(); ctx.arc(moonX, moonY, moonR * 4, 0, TAU); ctx.fill();
  }
  // Moon body — crescent via clipping path
  ctx.globalAlpha = 0.95;
  ctx.save();
  ctx.beginPath();
  ctx.arc(moonX, moonY, moonR, 0, TAU);
  ctx.arc(moonX + moonR * 0.55, moonY - moonR * 0.2, moonR * 0.82, 0, TAU, true);
  ctx.clip();
  if(PERF_LOW){
    ctx.fillStyle = '#d4cfc4';
  } else {
    const mG = ctx.createRadialGradient(moonX - 5, moonY - 5, moonR * 0.15, moonX, moonY, moonR);
    mG.addColorStop(0, '#f5f0e8');
    mG.addColorStop(0.6, '#d4cfc4');
    mG.addColorStop(1, '#b0b5c0');
    ctx.fillStyle = mG;
  }
  ctx.beginPath(); ctx.arc(moonX, moonY, moonR, 0, TAU); ctx.fill();
  ctx.restore();
  // Crescent soft outer glow (skip on mobile)
  if(!PERF_LOW){
    ctx.globalAlpha = 0.15;
    ctx.save();
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR + 3, 0, TAU);
    ctx.arc(moonX + moonR * 0.55, moonY - moonR * 0.2, moonR * 0.82 + 3, 0, TAU, true);
    ctx.clip();
    ctx.shadowColor = '#c0d8ff';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#c0d8ff';
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR + 2, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // Stars (draw fewer on mobile)
  ctx.globalAlpha = 1;
  const starStep = PERF_LOW ? 3 : 1; // every 3rd star on mobile
  for(let si=0;si<SKY_STARS.length;si+=starStep){
    const s = SKY_STARS[si];
    const twinkle = s.bright + Math.sin(t * s.speed + s.phase) * 0.3;
    const a = clamp(twinkle, 0.05, 1.0);
    ctx.globalAlpha = a;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
    // Larger stars get a subtle cross-glow (desktop only)
    if(s.r > 1.4 && !PERF_LOW){
      ctx.globalAlpha = a * 0.25;
      const ci = (s.phase * 3) | 0;
      ctx.fillStyle = ci % 7 === 0 ? '#ffe8c0' : ci % 5 === 0 ? '#c0d8ff' : '#ffffff';
      ctx.fillRect(s.x - s.r * 2.5, s.y - 0.3, s.r * 5, 0.6);
      ctx.fillRect(s.x - 0.3, s.y - s.r * 2.5, 0.6, s.r * 5);
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ─── ARENA GRADIENT CACHE (avoid creating gradient objects every frame) ───
let _arenaGradCache = {};
function getCachedGrad(key, factory){
  if(!_arenaGradCache[key]) _arenaGradCache[key] = factory();
  return _arenaGradCache[key];
}

// ─── ARENA DRAWING ───
function drawArena(t){
  drawSkyAbove(t); // draw starry sky above arena (visible when jumping)
  const aid = currentArena.id;
  if(aid === 'boardwalk') drawArenaBoardwalk(t);
  else if(aid === 'swamp') drawArenaSwamp(t);
  else if(aid === 'rooftop') drawArenaRooftop(t);
  else if(aid === 'colosseum') drawArenaColosseum(t);
  else drawArenaBoardwalk(t);

  // Mutator visual overlay
  if(activeMutator.id === 'lowgrav'){
    ctx.save(); ctx.globalAlpha = 0.06 + Math.sin(t*0.3)*0.03;
    ctx.fillStyle = '#a78bfa'; ctx.fillRect(0,0,AW,AH); ctx.restore();
  }
  if(activeMutator.id === 'turbo'){
    ctx.save(); ctx.globalAlpha = 0.04;
    for(let i=0;i<6;i++){
      const lx = (t*200+i*180)%AW;
      ctx.fillStyle='rgba(255,200,0,.3)';ctx.fillRect(lx,0,3,AH);
    }
    ctx.restore();
  }
}

// ─── ARENA: BOARDWALK (default) ───
function drawArenaBoardwalk(t){
  if(images.arena){
    ctx.drawImage(images.arena, 0,0,AW,AH);
  } else {
    if(PERF_LOW){
      ctx.fillStyle='#0a0a24';ctx.fillRect(0,0,AW,AH);
    } else {
      const sg=ctx.createLinearGradient(0,0,0,AH);
      sg.addColorStop(0,'#050510');sg.addColorStop(.5,'#0a0a24');sg.addColorStop(1,'#141440');
      ctx.fillStyle=sg;ctx.fillRect(0,0,AW,AH);
    }
  }
  // Stars (fewer on mobile)
  if(!PERF_LOW || _frameCount%2===0){
    ctx.save();
    const starCount = PERF_LOW ? 10 : 28;
    for(let i=0;i<starCount;i++){
      const sx=(i*31.7+10)%AW, sy=(i*17.3+5)%(AH*.32);
      const tw=.15+Math.sin(t*(.8+i*.07)+i)*.25+.25;
      ctx.globalAlpha=tw;ctx.fillStyle='#fff';
      ctx.beginPath();ctx.arc(sx,sy,PERF_LOW?1:rand(.5,1.8),0,TAU);ctx.fill();
    }
    ctx.globalAlpha=1;ctx.restore();
  }
  // Fog (skip on mobile — expensive gradient)
  if(!PERF_LOW){
    ctx.save();ctx.globalAlpha=.1+Math.sin(t*.5)*.03;
    const fogG=ctx.createLinearGradient(0,FLOOR_Y-50,0,AH);
    fogG.addColorStop(0,'transparent');fogG.addColorStop(.5,'rgba(180,140,80,.12)');fogG.addColorStop(1,'rgba(100,60,30,.2)');
    ctx.fillStyle=fogG;ctx.fillRect(0,FLOOR_Y-50,AW,AH-FLOOR_Y+50);
    ctx.restore();
  }


}

// ─── ARENA: SWAMP MIDNIGHT ───
function drawArenaSwamp(t){
  // Draw background image (covers full canvas)
  if(images.arenaSwamp){
    ctx.drawImage(images.arenaSwamp, 0,0,AW,AH);
  } else {
    // Fallback: deep swamp gradient
    if(PERF_LOW){
      ctx.fillStyle='#061218';ctx.fillRect(0,0,AW,AH);
    } else {
      const sg=ctx.createLinearGradient(0,0,0,AH);
      sg.addColorStop(0,'#020812');sg.addColorStop(.3,'#061218');sg.addColorStop(.6,'#0a1f12');sg.addColorStop(1,'#0d2818');
      ctx.fillStyle=sg;ctx.fillRect(0,0,AW,AH);
    }
  }
  // Fireflies (animated over the image)
  if(!PERF_LOW){
    ctx.save();
    for(let i=0;i<10;i++){
      const fx=AW*0.08+((Math.sin(t*0.3+i*2.1)*0.4+0.5)*AW*0.84);
      const fy=FLOOR_Y-120+Math.sin(t*0.7+i*1.7)*60;
      const fa=0.2+Math.sin(t*2+i*4)*0.4;
      if(fa>0){
        ctx.globalAlpha=fa*0.8;ctx.fillStyle='#4ade80';
        ctx.beginPath();ctx.arc(fx,fy,2,0,TAU);ctx.fill();
        ctx.globalAlpha=fa*0.2;ctx.fillStyle='#4ade80';
        ctx.beginPath();ctx.arc(fx,fy,9,0,TAU);ctx.fill();
      }
    }
    ctx.restore();
  }
  // Subtle mist overlay near floor
  if(!PERF_LOW){
    ctx.save();ctx.globalAlpha=.06+Math.sin(t*.3)*.03;
    const mist=ctx.createLinearGradient(0,FLOOR_Y-80,0,FLOOR_Y+20);
    mist.addColorStop(0,'transparent');mist.addColorStop(0.5,'rgba(100,200,120,.12)');mist.addColorStop(1,'rgba(50,120,60,.08)');
    ctx.fillStyle=mist;ctx.fillRect(0,FLOOR_Y-80,AW,100);
    ctx.restore();
  }
}

// ─── ARENA: NEON ROOFTOP ───
function drawArenaRooftop(t){
  // Mobile: simplified rooftop — solid bg + minimal detail
  if(PERF_LOW){
    ctx.fillStyle='#1a0a3a';ctx.fillRect(0,0,AW,AH);
    // Simple building silhouettes
    ctx.fillStyle='rgba(15,5,35,.9)';
    ctx.fillRect(20,FLOOR_Y-180,60,180);ctx.fillRect(260,FLOOR_Y-280,50,280);
    ctx.fillRect(500,FLOOR_Y-220,90,220);ctx.fillRect(760,FLOOR_Y-310,60,310);
    // Floor line
    ctx.strokeStyle='#ff3d9a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,FLOOR_Y);ctx.lineTo(AW,FLOOR_Y);ctx.stroke();
    // AC unit platform (simplified)
    const acu=ARENA_PLATFORMS.rooftop[0];
    ctx.fillStyle='#5a5a6a';ctx.fillRect(acu.x-8,acu.y,acu.w+16,acu.h);
    ctx.fillStyle='#2a2a3a';
    ctx.fillRect(acu.x+20,acu.y+acu.h,8,FLOOR_Y-acu.y-acu.h);
    ctx.fillRect(acu.x+acu.w-28,acu.y+acu.h,8,FLOOR_Y-acu.y-acu.h);
    return;
  }
  // City night sky
  const sg=ctx.createLinearGradient(0,0,0,AH);
  sg.addColorStop(0,'#0a0020');sg.addColorStop(.4,'#1a0a3a');sg.addColorStop(.7,'#2d1050');sg.addColorStop(1,'#0a0015');
  ctx.fillStyle=sg;ctx.fillRect(0,0,AW,AH);
  // City skyline (background buildings)
  ctx.save();
  const bldgs=[
    {x:20,w:60,h:180},{x:100,w:45,h:240},{x:160,w:80,h:200},{x:260,w:50,h:280},
    {x:330,w:70,h:160},{x:420,w:55,h:300},{x:500,w:90,h:220},{x:610,w:40,h:260},
    {x:670,w:75,h:190},{x:760,w:60,h:310},{x:840,w:50,h:170},{x:900,w:55,h:250},
  ];
  bldgs.forEach((b,i)=>{
    const by=FLOOR_Y-b.h;
    ctx.fillStyle='rgba(15,5,35,.9)';ctx.fillRect(b.x,by,b.w,b.h);
    // Windows
    ctx.fillStyle='rgba(255,200,100,.15)';
    for(let wy=by+10;wy<FLOOR_Y-15;wy+=18){
      for(let wx=b.x+6;wx<b.x+b.w-6;wx+=12){
        if(Math.sin(wx*7.3+wy*3.1+i)>0.2){
          ctx.globalAlpha=0.2+Math.sin(t*0.3+wx*0.01+wy*0.01)*0.15;
          ctx.fillRect(wx,wy,6,8);
        }
      }
    }
    ctx.globalAlpha=1;
  });
  ctx.restore();
  // Neon signs
  ctx.save();
  const neons = [
    {x:120,y:FLOOR_Y-210,w:60,h:12,col:'#ff3d9a'},
    {x:450,y:FLOOR_Y-270,w:50,h:10,col:'#00f0ff'},
    {x:700,y:FLOOR_Y-180,w:70,h:12,col:'#ffd740'},
  ];
  neons.forEach((n,i)=>{
    ctx.globalAlpha=0.5+Math.sin(t*2+i*3)*0.3;
    ctx.fillStyle=n.col;ctx.fillRect(n.x,n.y,n.w,n.h);
    ctx.globalAlpha=(0.15+Math.sin(t*2+i*3)*0.1);
    ctx.fillStyle=n.col;ctx.fillRect(n.x-10,n.y-10,n.w+20,n.h+20);
    ctx.globalAlpha=1;
  });
  ctx.restore();
  // Stars (sparse, purple tint)
  ctx.save();
  for(let i=0;i<15;i++){
    const sx=(i*61.7+30)%AW, sy=(i*19.3+5)%(AH*.22);
    const tw=.1+Math.sin(t*(.6+i*.04)+i*2)*.2+.15;
    ctx.globalAlpha=tw;ctx.fillStyle=i%4===0?'#ff80d0':'#c0c0ff';
    ctx.beginPath();ctx.arc(sx,sy,rand(.3,1.2),0,TAU);ctx.fill();
  }
  ctx.globalAlpha=1;ctx.restore();
  // Rooftop surface glow
  ctx.save();
  const rf=ctx.createLinearGradient(0,FLOOR_Y-8,0,FLOOR_Y+12);
  rf.addColorStop(0,'rgba(255,0,150,.12)');rf.addColorStop(0.5,'rgba(100,0,200,.08)');rf.addColorStop(1,'rgba(0,0,50,.4)');
  ctx.fillStyle=rf;ctx.fillRect(0,FLOOR_Y-8,AW,20);
  // Neon edge line
  ctx.globalAlpha=0.4+Math.sin(t*1.5)*0.2;
  ctx.strokeStyle='#ff3d9a';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(0,FLOOR_Y);ctx.lineTo(AW,FLOOR_Y);ctx.stroke();
  ctx.globalAlpha=0.15;ctx.strokeStyle='#00f0ff';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(0,FLOOR_Y+4);ctx.lineTo(AW,FLOOR_Y+4);ctx.stroke();
  ctx.restore();

  // ─── NEON AC UNIT / SATELLITE PERCH ───
  const acu = ARENA_PLATFORMS.rooftop[0];
  const acX = acu.x, acTop = acu.y, acW = acu.w;
  ctx.save();
  // Support legs (metal struts)
  ctx.fillStyle = '#2a2a3a';
  ctx.fillRect(acX + 20, acTop + acu.h, 8, FLOOR_Y - acTop - acu.h);
  ctx.fillRect(acX + acW - 28, acTop + acu.h, 8, FLOOR_Y - acTop - acu.h);
  // Cross brace
  ctx.strokeStyle = '#3a3a4a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(acX + 24, acTop + acu.h + 40); ctx.lineTo(acX + acW - 24, FLOOR_Y - 20); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(acX + acW - 24, acTop + acu.h + 40); ctx.lineTo(acX + 24, FLOOR_Y - 20); ctx.stroke();
  // AC unit body (industrial metal box)
  const boxH = 50;
  const boxG = ctx.createLinearGradient(acX, acTop - boxH + acu.h, acX, acTop + acu.h);
  boxG.addColorStop(0, '#4a4a5a'); boxG.addColorStop(0.5, '#5a5a6a'); boxG.addColorStop(1, '#3a3a48');
  ctx.fillStyle = boxG;
  ctx.fillRect(acX + 5, acTop + acu.h - boxH, acW - 10, boxH);
  // Metal panel lines
  ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(acX + acW/3, acTop + acu.h - boxH + 5); ctx.lineTo(acX + acW/3, acTop + acu.h - 5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(acX + acW*2/3, acTop + acu.h - boxH + 5); ctx.lineTo(acX + acW*2/3, acTop + acu.h - 5); ctx.stroke();
  // Fan grille (circle with spinning blades)
  const fanCX = acX + acW * 0.25, fanCY = acTop + acu.h - boxH/2;
  const fanR = 16;
  ctx.strokeStyle = 'rgba(200,200,220,.3)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(fanCX, fanCY, fanR, 0, TAU); ctx.stroke();
  // Spinning fan blades
  const fanAngle = t * 4;
  ctx.strokeStyle = 'rgba(200,200,220,.2)'; ctx.lineWidth = 3;
  for(let fi = 0; fi < 4; fi++){
    const fa = fanAngle + fi * Math.PI/2;
    ctx.beginPath();
    ctx.moveTo(fanCX, fanCY);
    ctx.lineTo(fanCX + Math.cos(fa) * fanR * 0.85, fanCY + Math.sin(fa) * fanR * 0.85);
    ctx.stroke();
  }
  // Exhaust vent (right side)
  ctx.fillStyle = 'rgba(100,100,120,.5)';
  for(let vi = 0; vi < 6; vi++){
    ctx.fillRect(acX + acW * 0.55 + vi * 12, acTop + acu.h - boxH + 10, 8, 2);
    ctx.fillRect(acX + acW * 0.55 + vi * 12, acTop + acu.h - boxH + 18, 8, 2);
    ctx.fillRect(acX + acW * 0.55 + vi * 12, acTop + acu.h - boxH + 26, 8, 2);
  }
  // Platform top (metal grating)
  ctx.fillStyle = '#5a5a6a';
  ctx.fillRect(acX - 8, acTop, acW + 16, acu.h);
  // Grating lines
  ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 1;
  for(let gi = acX; gi < acX + acW; gi += 12){
    ctx.beginPath(); ctx.moveTo(gi, acTop); ctx.lineTo(gi, acTop + acu.h); ctx.stroke();
  }
  // Neon edge glow on platform
  const neonPulse = 0.4 + Math.sin(t * 2) * 0.2;
  if(!PERF_LOW){ctx.shadowColor = '#ff3d9a'; ctx.shadowBlur = 12 * neonPulse;}
  ctx.strokeStyle = 'rgba(255,61,154,' + neonPulse + ')'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(acX - 8, acTop + acu.h); ctx.lineTo(acX + acW + 8, acTop + acu.h); ctx.stroke();
  ctx.shadowBlur = 0;
  // Satellite dish on top
  const dishX = acX + acW * 0.75, dishY = acTop - 5;
  ctx.fillStyle = '#6a6a7a';
  ctx.fillRect(dishX, dishY, 4, -25);
  // Dish arc
  ctx.strokeStyle = '#8a8a9a'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(dishX + 2, dishY - 28, 14, -0.3, Math.PI + 0.3);
  ctx.stroke();
  // Blinking red light
  const blinkA = Math.sin(t * 3) > 0.3 ? 0.9 : 0.15;
  ctx.globalAlpha = blinkA; ctx.fillStyle = '#ff2020';
  ctx.beginPath(); ctx.arc(dishX + 2, dishY - 28, 3, 0, TAU); ctx.fill();
  ctx.globalAlpha = blinkA * 0.4;
  ctx.beginPath(); ctx.arc(dishX + 2, dishY - 28, 8, 0, TAU); ctx.fill();
  // Steam/heat haze from AC
  ctx.globalAlpha = 1;
  for(let hi = 0; hi < 3; hi++){
    const hx = acX + 20 + hi * 30 + Math.sin(t * 0.7 + hi) * 5;
    const hy = acTop - 10 - hi * 12 - Math.sin(t * 0.5 + hi * 2) * 6;
    ctx.globalAlpha = 0.06 - hi * 0.015;
    ctx.fillStyle = 'rgba(200,200,255,.3)';
    ctx.beginPath(); ctx.ellipse(hx, hy, 8 + hi * 4, 3, 0, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ─── ARENA: CROC COLOSSEUM (final boss arena) ───
function drawArenaColosseum(t){
  // Draw full background image
  if(images.arenaColosseum){
    ctx.drawImage(images.arenaColosseum, 0,0,AW,AH);
  } else {
    // Fallback: dark stone gradient
    if(PERF_LOW){
      ctx.fillStyle='#1a0a08';ctx.fillRect(0,0,AW,AH);
    } else {
      const sg=ctx.createLinearGradient(0,0,0,AH);
      sg.addColorStop(0,'#2d0a00');sg.addColorStop(.4,'#1a0808');sg.addColorStop(.8,'#0d0505');sg.addColorStop(1,'#1a0a04');
      ctx.fillStyle=sg;ctx.fillRect(0,0,AW,AH);
    }
  }
  if(PERF_LOW){
    // Simplified: floor line + basic platforms
    ctx.strokeStyle='#ff8c00';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,FLOOR_Y);ctx.lineTo(AW,FLOOR_Y);ctx.stroke();
    const plats = ARENA_PLATFORMS.colosseum;
    plats.forEach(p => {
      ctx.fillStyle='#5a4a3a';ctx.fillRect(p.x-6,p.y,p.w+12,p.h);
    });
    return;
  }
  // Animated fire glow on floor
  ctx.save();
  ctx.globalAlpha = 0.08 + Math.sin(t*1.5)*0.04;
  const fireG = ctx.createLinearGradient(0,FLOOR_Y-60,0,AH);
  fireG.addColorStop(0,'transparent');
  fireG.addColorStop(0.3,'rgba(255,100,0,.15)');
  fireG.addColorStop(0.7,'rgba(200,60,0,.1)');
  fireG.addColorStop(1,'rgba(100,20,0,.05)');
  ctx.fillStyle=fireG;ctx.fillRect(0,FLOOR_Y-60,AW,AH-FLOOR_Y+60);
  ctx.restore();
  // Flickering torch particles
  ctx.save();
  const torchXs = [120, 380, 580, 840]; // torch positions across arena
  torchXs.forEach((tx, ti) => {
    for(let pi=0; pi<3; pi++){
      const py = FLOOR_Y - 30 - Math.abs(Math.sin(t*3+ti*2+pi*1.3))*40;
      const px = tx + Math.sin(t*2.5+pi*4+ti)*8;
      const pr = 2 + Math.sin(t*4+ti+pi)*1;
      ctx.globalAlpha = 0.3 + Math.sin(t*3+ti+pi)*0.2;
      ctx.fillStyle = pi%2===0 ? '#ff6a00' : '#ffd740';
      ctx.beginPath();ctx.arc(px,py,pr,0,Math.PI*2);ctx.fill();
    }
  });
  ctx.globalAlpha=1;ctx.restore();
  // Draw platforms as stone slabs
  const plats = ARENA_PLATFORMS.colosseum;
  plats.forEach(p => {
    // Stone slab with shadow
    ctx.fillStyle='rgba(0,0,0,.3)';ctx.fillRect(p.x-4,p.y+4,p.w+8,p.h+4);
    const slabG = ctx.createLinearGradient(0,p.y,0,p.y+p.h);
    slabG.addColorStop(0,'#7a6a5a');slabG.addColorStop(0.5,'#5a4a3a');slabG.addColorStop(1,'#4a3a2a');
    ctx.fillStyle=slabG;ctx.fillRect(p.x-4,p.y,p.w+8,p.h);
    // Stone top highlight
    ctx.fillStyle='rgba(255,200,120,.08)';ctx.fillRect(p.x-4,p.y,p.w+8,3);
    // Support pillars
    ctx.fillStyle='#3a2a1a';
    ctx.fillRect(p.x+15,p.y+p.h,10,FLOOR_Y-p.y-p.h);
    ctx.fillRect(p.x+p.w-25,p.y+p.h,10,FLOOR_Y-p.y-p.h);
  });
  // Subtle ember particles floating up
  ctx.save();
  for(let i=0;i<8;i++){
    const ex = (i*127+t*30)%AW;
    const ey = FLOOR_Y - 20 - ((t*40+i*60)%200);
    const ea = 0.15 + Math.sin(t*2+i)*0.1;
    ctx.globalAlpha = Math.max(0,ea);
    ctx.fillStyle = i%3===0?'#ff4400':'#ffa040';
    ctx.beginPath();ctx.arc(ex,ey,1+Math.sin(t+i)*0.5,0,Math.PI*2);ctx.fill();
  }
  ctx.globalAlpha=1;ctx.restore();
}

// ─── FRAME-BASED SWING ANIMATION ───
// Attack timing (seconds)
const ATK_ANTIC = 0.12;   // wind-up (frame 1)
const ATK_SWING = 0.10;   // mid-swing (frame 2)
const ATK_FOLLOW = 0.18;  // follow-through (frame 3) + settle back
const ATK_TOTAL = ATK_ANTIC + ATK_SWING + ATK_FOLLOW;

// Get the correct swing frame image for a croc during attack
function getSwingFrame(c){
  if(c.atkAnim <= 0) return null; // not attacking → use idle sprite
  const progress = 1 - c.atkAnim; // 0→1
  const anticEnd = ATK_ANTIC / ATK_TOTAL;
  const swingEnd = (ATK_ANTIC + ATK_SWING) / ATK_TOTAL;
  const key = c.charKey || 'gary';
  if(progress < anticEnd){
    return images[key + '_swing1']; // wind-up
  } else if(progress < swingEnd){
    return images[key + '_swing2']; // mid-swing
  } else {
    return images[key + '_swing3']; // follow-through
  }
}

// Easing functions
function easeOutBack(t){ const c1=1.70158, c3=c1+1; return 1+c3*Math.pow(t-1,3)+c1*Math.pow(t-1,2); }
function easeInCubic(t){ return t*t*t; }
function easeOutCubic(t){ return 1-Math.pow(1-t,3); }
function easeOutElastic(t){ const c4=TAU/3; return t===0?0:t===1?1:Math.pow(2,-10*t)*Math.sin((t*10-0.75)*c4)+1; }

// ─── DRAW CROC (Frame-Based Sprite Swap) ───
function drawCroc(c){
  // Choose sprite: swing frame during attack, else idle/skin sprite
  const swingImg = getSwingFrame(c);
  const idleImg = getSpriteForCroc(c);
  const img = swingImg || idleImg;

  ctx.save();
  const bobOff = c.grounded ? -c.stepBounce : 0;
  const cx = c.x+c.w/2, cy = c.y+c.h/2 + bobOff + c.headBob;
  ctx.translate(cx, cy);

  if(c.launched) ctx.rotate(c.launchRot);
  if(c.dead) ctx.rotate(c.deathRot);

  ctx.scale(c.face, 1);

  // Breathing
  const breathAmt = c.frozen ? 0 : Math.sin(c.breathCycle) * 0.018;
  ctx.scale(c.squash * (1+breathAmt), c.stretch * (1-breathAmt*0.6));

  // Body lean
  if(!c.launched && !c.dead && c.grounded) ctx.rotate(c.bodyLean);
  // Hit recoil
  if(c.hitRecoil !== 0 && !c.launched && !c.dead) ctx.rotate(c.hitRecoil);
  // Tornado / Dizzy
  if(c.diving) ctx.rotate(c.diveSpinT % TAU); // Power Pillow Drive spin
  else if(c.tornadoAct) ctx.rotate((Date.now()/60)%TAU);
  if(c.dizzy) ctx.rotate(Math.sin(Date.now()*0.012)*0.15);

  if(c.hitFlash>0 && Math.floor(c.hitFlash*30)%2===0) ctx.globalAlpha=.35;
  if(c.stunned&&!c.launched) ctx.globalAlpha=.5+Math.sin(Date.now()*.02)*.2;

  // ─── AURAS (rage, comeback, speed, shield) — simplified on mobile ───
  const isRage = c.hp<=1 && c.alive && !c.dead && !c.launched;
  if(isRage){
    ctx.save(); ctx.globalAlpha=.3+Math.sin(Date.now()*0.006)*.15;
    if(PERF_LOW){
      ctx.fillStyle='rgba(255,30,0,.25)';ctx.beginPath();ctx.arc(0,0,120,0,TAU);ctx.fill();
    } else {
      const rG=ctx.createRadialGradient(0,0,40,0,0,200);
      rG.addColorStop(0,'rgba(255,30,0,.6)');rG.addColorStop(0.5,'rgba(255,80,0,.3)');rG.addColorStop(1,'transparent');
      ctx.fillStyle=rG;ctx.fillRect(-200,-200,400,400);
    }
    ctx.restore();
  }
  if(c.comebackActive&&!isRage&&!c.dead&&!c.launched && !PERF_LOW){
    ctx.save();ctx.globalAlpha=.28+Math.sin(c.comebackFlash)*.1;
    const aG=ctx.createRadialGradient(0,0,40,0,0,180);
    aG.addColorStop(0,'rgba(255,50,0,.4)');aG.addColorStop(1,'transparent');
    ctx.fillStyle=aG;ctx.fillRect(-180,-180,360,360);ctx.restore();
  }
  if(c.speedBoost>1&&!c.dead&&!c.launched){
    ctx.save();ctx.globalAlpha=.25+Math.sin(Date.now()*0.01)*.1;
    ctx.strokeStyle='#4ade80';ctx.lineWidth=3;
    if(!PERF_LOW){ctx.shadowColor='#4ade80';ctx.shadowBlur=18;}
    ctx.beginPath();ctx.arc(0,0,c.w*.65,0,TAU);ctx.stroke();ctx.shadowBlur=0;ctx.restore();
  }
  if(c.shieldActive&&!c.dead&&!c.launched){
    ctx.save();ctx.globalAlpha=.4+Math.sin(Date.now()*0.008)*.15;
    if(PERF_LOW){
      ctx.fillStyle='rgba(96,165,250,.2)';ctx.beginPath();ctx.arc(0,0,150,0,TAU);ctx.fill();
      ctx.strokeStyle='#60a5fa';ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(0,0,150,0,TAU);ctx.stroke();
    } else {
      const sG=ctx.createRadialGradient(0,0,60,0,0,160);
      sG.addColorStop(0,'rgba(96,165,250,.15)');sG.addColorStop(1,'rgba(96,165,250,.4)');
      ctx.fillStyle=sG;ctx.beginPath();ctx.arc(0,0,150,0,TAU);ctx.fill();
      ctx.strokeStyle='#60a5fa';ctx.lineWidth=2.5;ctx.shadowColor='#60a5fa';ctx.shadowBlur=20;
      ctx.beginPath();ctx.arc(0,0,150,0,TAU);ctx.stroke();ctx.shadowBlur=0;
    }
    ctx.restore();
  }

  // Drop shadow
  if(!c.launched){
    ctx.save();ctx.globalAlpha=.35;ctx.fillStyle='rgba(0,0,0,.6)';
    const sw=c.w*.4+(Math.abs(c.vx)>15?Math.sin(c.walkCycle*2)*8:0);
    ctx.beginPath();ctx.ellipse(0,c.h/2+8-bobOff-c.headBob,sw,14,0,0,TAU);ctx.fill();ctx.restore();
  }

  // ─── SPRITE DRAWING — SINGLE FULL-FRAME DRAW ───
  if(img){
    const drawW = c.w*1.12, drawH = c.h*1.08;

    // Motion blur ghost trails during mid-swing (skip on mobile — extra drawImage calls)
    if(c.atkAnim > 0 && !PERF_LOW){
      const progress = 1 - c.atkAnim;
      const anticEnd = ATK_ANTIC / ATK_TOTAL;
      const swingEnd = (ATK_ANTIC + ATK_SWING) / ATK_TOTAL;
      if(progress >= anticEnd * 0.7 && progress < swingEnd + 0.12){
        const ghostFrames = [images[(c.charKey||'gary')+'_swing1'], images[(c.charKey||'gary')+'_swing2']];
        for(let g=ghostFrames.length-1; g>=0; g--){
          const gImg = ghostFrames[g];
          if(!gImg) continue;
          const ghostAlpha = (1 - (g+1)/3) * 0.15;
          ctx.save();
          ctx.globalAlpha = ghostAlpha;
          ctx.drawImage(gImg, -drawW/2 - (g+1)*6, -drawH/2, drawW, drawH);
          ctx.restore();
        }
      }
    }

    // Main sprite draw — full frame (no clipping!)
    ctx.drawImage(img, -drawW/2, -drawH/2, drawW, drawH);

    // === SWING ARC FX ===
    if(c.atkAnim > 0){
      const progress = 1 - c.atkAnim;
      const anticEnd = ATK_ANTIC / ATK_TOTAL;
      const swingEnd = (ATK_ANTIC + ATK_SWING) / ATK_TOTAL;
      if(progress >= anticEnd * 0.5 && progress < swingEnd + 0.1){
        ctx.save();
        const intensity = progress < swingEnd
          ? easeInCubic((progress - anticEnd*0.5) / (swingEnd - anticEnd*0.5))
          : 1 - (progress-swingEnd)/0.1;
        ctx.globalAlpha = clamp(intensity * 0.7, 0, 0.7);
        // Arc swoosh at the pillow area
        const arcCX = drawW * 0.2 * c.face;
        const arcCY = -drawH * 0.15;
        const arcR = drawW * 0.5;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 6 + intensity * 8;
        ctx.lineCap = 'round';
        if(!PERF_LOW){ctx.shadowColor = '#fff'; ctx.shadowBlur = 24;}
        ctx.beginPath();
        ctx.arc(arcCX, arcCY, arcR, -0.8, 0.6);
        ctx.stroke();
        // Impact sparkle
        if(intensity > 0.5){
          ctx.globalAlpha = intensity;
          ctx.fillStyle = '#fff';
          const tipX = arcCX + Math.cos(0.6) * arcR;
          const tipY = arcCY + Math.sin(0.6) * arcR;
          ctx.beginPath(); ctx.arc(tipX, tipY, 6+intensity*14, 0, TAU); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,200,0.7)'; ctx.lineWidth = 2;
          for(let r=0; r<5; r++){
            const a = r * TAU/5 + Date.now()*0.01;
            ctx.beginPath();
            ctx.moveTo(tipX+Math.cos(a)*10, tipY+Math.sin(a)*10);
            ctx.lineTo(tipX+Math.cos(a)*(18+intensity*8), tipY+Math.sin(a)*(18+intensity*8));
            ctx.stroke();
          }
        }
        ctx.shadowBlur = 0;
        ctx.restore();
      }
    }

    // Dash trail (uses current sprite) — skip on mobile
    if(c.dashing && !PERF_LOW){
      ctx.globalAlpha=.12;
      for(let tr=1;tr<=3;tr++) ctx.drawImage(img,-drawW/2-tr*28*c.face,-drawH/2,drawW,drawH);
      ctx.globalAlpha=1;
    }
  }

  // ─── OVERLAY FX (frozen, parry, tornado, dizzy, stun, etc.) ───
  if(c.frozen && !c.dead){
    ctx.save();
    const crackA=clamp(1-(c.frozenT/3),0,1);
    ctx.globalAlpha=0.75-crackA*0.3;
    if(PERF_LOW){
      ctx.fillStyle='rgba(147,197,253,0.7)';ctx.strokeStyle='rgba(255,255,255,0.7)';ctx.lineWidth=3;
    } else {
      const iceG=ctx.createLinearGradient(-c.w/2,-c.h/2,c.w/2,c.h/2);
      iceG.addColorStop(0,'rgba(219,234,254,0.9)');iceG.addColorStop(0.5,'rgba(147,197,253,0.75)');iceG.addColorStop(1,'rgba(96,165,250,0.9)');
      ctx.fillStyle=iceG;ctx.strokeStyle='rgba(255,255,255,0.7)';ctx.lineWidth=3;
    }
    ctx.beginPath();ctx.roundRect(-c.w/2*1.05,-c.h/2*1.05,c.w*1.1,c.h*1.1,8);ctx.fill();ctx.stroke();
    if(crackA>0.4){
      ctx.globalAlpha=crackA;ctx.strokeStyle='rgba(255,255,255,0.9)';ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(-c.w*0.3,-c.h*0.4);ctx.lineTo(c.w*0.1,c.h*0.1);ctx.lineTo(-c.w*0.1,c.h*0.4);ctx.stroke();
      ctx.beginPath();ctx.moveTo(c.w*0.2,-c.h*0.2);ctx.lineTo(-c.w*0.05,c.h*0.2);ctx.stroke();
    }
    ctx.shadowBlur=0;ctx.restore();
  }
  if(c.parrying){
    ctx.save();
    if(PERF_LOW){
      ctx.fillStyle='rgba(139,92,246,.2)';ctx.beginPath();ctx.arc(0,0,c.w*.75,0,TAU);ctx.fill();
      ctx.strokeStyle='#a78bfa';ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(0,0,c.w*.75,0,TAU);ctx.stroke();
    } else {
      const pG=ctx.createRadialGradient(0,0,c.w*.45,0,0,c.w*.75);
      pG.addColorStop(0,'rgba(139,92,246,.1)');pG.addColorStop(1,'rgba(139,92,246,.3)');
      ctx.fillStyle=pG;ctx.beginPath();ctx.arc(0,0,c.w*.75,0,TAU);ctx.fill();
      ctx.strokeStyle='#a78bfa';ctx.lineWidth=2.5;ctx.shadowColor='#a78bfa';ctx.shadowBlur=18;
      ctx.beginPath();ctx.arc(0,0,c.w*.75,0,TAU);ctx.stroke();ctx.shadowBlur=0;
    }
    ctx.restore();
  }
  if(c.tornadoAct){
    ctx.save();ctx.globalAlpha=.5;
    const tt=Date.now()/70;
    for(let r=0;r<(PERF_LOW?2:4);r++){
      ctx.strokeStyle=r%2?'#ffd740':'#fff';ctx.lineWidth=2.5;
      if(!PERF_LOW){ctx.shadowColor='#ffd740';ctx.shadowBlur=10;}
      ctx.beginPath();ctx.arc(0,0,c.w*.52+r*20,tt+r,tt+r+4.2);ctx.stroke();
    }
    ctx.shadowBlur=0;ctx.restore();
  }
  // Inferno fire aura — character wreathed in flames
  if(c.infernoAura){
    ctx.save();
    const fT = Date.now()/80;
    // Outer fire glow
    if(!PERF_LOW){
      const fireRad = ctx.createRadialGradient(0,0,c.w*.3, 0,0,c.w*1.1);
      fireRad.addColorStop(0,'rgba(255,68,0,.15)');
      fireRad.addColorStop(0.5,'rgba(255,120,0,.08)');
      fireRad.addColorStop(1,'rgba(255,200,0,0)');
      ctx.fillStyle=fireRad;ctx.beginPath();ctx.arc(0,0,c.w*1.1,0,TAU);ctx.fill();
    }
    // Animated flame tongues
    const flameCount = PERF_LOW ? 4 : 8;
    for(let fi=0;fi<flameCount;fi++){
      const fAngle = (fi/flameCount)*TAU + fT;
      const fDist = c.w*0.5 + Math.sin(fT*3+fi*2)*8;
      const fx = Math.cos(fAngle)*fDist;
      const fy = Math.sin(fAngle)*fDist - Math.abs(Math.sin(fT*4+fi))*20;
      const fSz = 6 + Math.sin(fT*5+fi)*3;
      ctx.globalAlpha = 0.5 + Math.sin(fT*3+fi)*0.2;
      ctx.fillStyle = fi%3===0 ? '#ffd740' : fi%3===1 ? '#ff6a00' : '#ff3300';
      if(!PERF_LOW){ctx.shadowColor='#ff4400';ctx.shadowBlur=12;}
      ctx.beginPath();ctx.arc(fx,fy,fSz,0,TAU);ctx.fill();
    }
    // Inner bright core glow
    ctx.globalAlpha = 0.15 + Math.sin(fT*2)*0.05;
    ctx.fillStyle = '#ffd740';
    ctx.beginPath();ctx.arc(0,0,c.w*0.4,0,TAU);ctx.fill();
    ctx.shadowBlur=0;ctx.globalAlpha=1;
    ctx.restore();
  }
  // SECRET: Fireball Aura — massive fire ring around croc (bigger than inferno)
  if(c.fireAuraActive){
    ctx.save();
    const fT = Date.now()/60;
    // Massive outer fire glow
    if(!PERF_LOW){
      const fireRad = ctx.createRadialGradient(0,0,c.w*.2, 0,0,c.w*2.2);
      fireRad.addColorStop(0,'rgba(255,30,0,.2)');
      fireRad.addColorStop(0.3,'rgba(255,80,0,.12)');
      fireRad.addColorStop(0.6,'rgba(255,200,0,.06)');
      fireRad.addColorStop(1,'rgba(255,200,0,0)');
      ctx.fillStyle=fireRad;ctx.beginPath();ctx.arc(0,0,c.w*2.2,0,TAU);ctx.fill();
    }
    // Massive animated flame tongues — double density of inferno
    const flameCount = PERF_LOW ? 8 : 16;
    for(let fi=0;fi<flameCount;fi++){
      const fAngle = (fi/flameCount)*TAU + fT;
      const fDist = c.w*0.9 + Math.sin(fT*3+fi*2)*15;
      const fx = Math.cos(fAngle)*fDist;
      const fy = Math.sin(fAngle)*fDist - Math.abs(Math.sin(fT*4+fi))*30;
      const fSz = 10 + Math.sin(fT*5+fi)*5;
      ctx.globalAlpha = 0.6 + Math.sin(fT*3+fi)*0.2;
      ctx.fillStyle = fi%4===0 ? '#fff' : fi%4===1 ? '#ffd740' : fi%4===2 ? '#ff6a00' : '#ff2200';
      if(!PERF_LOW){ctx.shadowColor='#ff2200';ctx.shadowBlur=20;}
      ctx.beginPath();ctx.arc(fx,fy,fSz,0,TAU);ctx.fill();
    }
    // Inner white-hot core
    ctx.globalAlpha = 0.2 + Math.sin(fT*2)*0.08;
    ctx.fillStyle = '#fff';
    ctx.beginPath();ctx.arc(0,0,c.w*0.5,0,TAU);ctx.fill();
    ctx.shadowBlur=0;ctx.globalAlpha=1;
    ctx.restore();
  }
  // SECRET: Laser Eyes — bright blue glowing eyes + laser beams
  if(c.laserEyesActive){
    ctx.save();
    const lt = Date.now()/50;
    const eyeY = -c.h*0.25;
    const eyeX1 = c.face > 0 ? c.w*0.15 : -c.w*0.15;
    const eyeX2 = c.face > 0 ? c.w*0.25 : -c.w*0.25;
    // Bright blue glowing eyes
    for(const ex of [eyeX1, eyeX2]){
      ctx.globalAlpha=0.9;
      ctx.fillStyle='#00ccff';
      if(!PERF_LOW){ctx.shadowColor='#00ccff';ctx.shadowBlur=30;}
      ctx.beginPath();ctx.arc(ex,eyeY,6,0,TAU);ctx.fill();
      // Eye glow halo
      ctx.globalAlpha=0.3;
      ctx.beginPath();ctx.arc(ex,eyeY,14,0,TAU);ctx.fill();
    }
    // Laser beams shooting from eyes toward opponent
    const laserLen = 500 * c.face;
    ctx.globalAlpha=0.7+Math.sin(lt*8)*0.2;
    ctx.strokeStyle='#00ccff';
    ctx.lineWidth=4;
    if(!PERF_LOW){ctx.shadowColor='#00ccff';ctx.shadowBlur=25;}
    ctx.beginPath();ctx.moveTo(eyeX1,eyeY);ctx.lineTo(eyeX1+laserLen,eyeY+Math.sin(lt*6)*10);ctx.stroke();
    ctx.beginPath();ctx.moveTo(eyeX2,eyeY);ctx.lineTo(eyeX2+laserLen,eyeY-Math.sin(lt*6)*10);ctx.stroke();
    // Thinner bright core of beams
    ctx.globalAlpha=0.9;
    ctx.strokeStyle='#ffffff';
    ctx.lineWidth=1.5;
    ctx.beginPath();ctx.moveTo(eyeX1,eyeY);ctx.lineTo(eyeX1+laserLen,eyeY+Math.sin(lt*6)*10);ctx.stroke();
    ctx.beginPath();ctx.moveTo(eyeX2,eyeY);ctx.lineTo(eyeX2+laserLen,eyeY-Math.sin(lt*6)*10);ctx.stroke();
    ctx.shadowBlur=0;ctx.globalAlpha=1;
    ctx.restore();
  }
  if(c.tailAct){
    ctx.save();ctx.globalAlpha=.7;
    const tAngle=(Date.now()/30)%TAU;
    ctx.strokeStyle=c===p1?'#4ade80':'#f472b6';
    ctx.lineWidth=8;ctx.lineCap='round';
    if(!PERF_LOW){ctx.shadowColor=ctx.strokeStyle;ctx.shadowBlur=24;}
    ctx.beginPath();ctx.arc(0,c.h*.1,TAIL_RANGE*.55,tAngle,tAngle+2.5);
    ctx.stroke();ctx.shadowBlur=0;ctx.restore();
  }
  if(c.dizzy&&!c.launched){
    ctx.fillStyle='#ffd740';if(!PERF_LOW){ctx.shadowColor='#ffd740';ctx.shadowBlur=6;}
    for(let i=0;i<(PERF_LOW?3:5);i++){
      const sa=Date.now()*0.004+i*1.256;
      ctx.save();ctx.translate(Math.cos(sa)*50,-c.h/2-18+Math.sin(sa)*12);ctx.rotate(sa*2);
      drawStar5(ctx,0,0,8,3.5);ctx.restore();
    }
    ctx.shadowBlur=0;
  }
  if(c.stunned&&!c.launched&&!c.frozen){
    ctx.fillStyle='#ffd740';if(!PERF_LOW){ctx.shadowColor='#ffd740';ctx.shadowBlur=5;}
    for(let i=0;i<4;i++){
      const sa=Date.now()*.005+i*1.57;
      ctx.save();ctx.translate(Math.cos(sa)*42,-c.h/2-14+Math.sin(sa)*10);ctx.rotate(sa*2);
      drawStar5(ctx,0,0,8,3.5);ctx.restore();
    }
    ctx.shadowBlur=0;
  }
  if(c.doubleDmg&&!c.dead){
    ctx.save();ctx.globalAlpha=0.7+Math.sin(Date.now()*0.01)*0.2;
    ctx.fillStyle='#f472b6';ctx.font='bold 16px Fredoka,sans-serif';
    ctx.textAlign='center';ctx.textBaseline='middle';
    if(!PERF_LOW){ctx.shadowColor='#f472b6';ctx.shadowBlur=10;}
    ctx.fillText('x2',0,-c.h/2-30);ctx.shadowBlur=0;ctx.restore();
  }
  if(c.lightningCloud&&c.lightningCloud>0){
    ctx.save();ctx.globalAlpha=c.lightningCloud*0.85;
    ctx.fillStyle='#374151';if(!PERF_LOW){ctx.shadowColor='#ffd740';ctx.shadowBlur=15;}
    ctx.beginPath();
    const cloudX=0,cloudY=-c.h/2-70;
    ctx.arc(cloudX,cloudY,45,0,TAU);
    ctx.arc(cloudX-35,cloudY+12,32,0,TAU);
    ctx.arc(cloudX+35,cloudY+12,32,0,TAU);
    ctx.fill();ctx.shadowBlur=0;ctx.restore();
  }

  ctx.shadowBlur=0;ctx.restore();
}

// ─── CROC CONSTRUCTOR ───
let loadout = { p1:{power1:'freeze',power2:'sax',power3:null,power4:null,skin:'default'}, p2:{power1:'lightning',power2:'shotgun',power3:null,power4:null,skin:'default'} };

function mkCroc(x,face,name,charKey){
  return {x,y:FLOOR_Y-CH,vx:0,vy:0,w:CW,h:CH,face,name,charKey,skin:'default',
    hp:MAX_HP,wins:0,alive:true,grounded:true,
    atk:false,atkT:0,atkCD:0,
    dashing:false,dashT:0,dashCD:0,dashDir:0,
    tornadoAct:false,tornadoT:0,tornadoCD:0,
    tailAct:false,tailT:0,tailCD:0,
    parrying:false,parryT:0,parryCD:0,parryOK:false,
    launched:false,launchVy:0,launchVx:0,launchSpin:0,launchRot:0,launchTimer:0,launchIsKO:false,
    launchCD:0,
    stunned:false,stunT:0,
    frozen:false,frozenT:0,frozenCracks:0,
    dizzy:false,dizzyT:0,dizzyAngle:0,
    hitFlash:0,squash:1,stretch:1,
    combo:0,comboT:0,maxCombo:0,totalDmg:0,hits:0,parryCount:0,
    comebackActive:false,comebackFlash:0,
    dead:false,deathVx:0,deathVy:0,deathBounces:0,deathRot:0,deathRotV:0,
    bufAtk:false,bufParry:false,
    // Special powers
    power1:'freeze',power2:'sax',power3:null,power4:null,
    pow1CD:0,pow2CD:0,pow3CD:0,pow4CD:0,
    // Buffs
    speedBoost:1,speedBoostT:0,
    shieldActive:false,
    doubleDmg:false,
    // Rage
    rageSuperUsed:false,
    rageCD:0, // 15s cooldown rage button
    // Lightning cloud anim
    lightningCloud:0,
    // ─── PROCEDURAL ANIMATION STATE ───
    animT:0,           // master animation clock
    walkCycle:0,       // walk cycle phase (radians)
    breathCycle:0,     // idle breathing phase
    armAngle:0,        // current arm/pillow swing angle
    armTarget:0,       // arm target angle (for smooth interp)
    bodyLean:0,        // forward lean when moving
    headBob:0,         // vertical bob offset
    legPhaseL:0,       // left leg phase
    legPhaseR:Math.PI, // right leg phase (opposite)
    hitRecoil:0,       // hit recoil rotation
    stepBounce:0,      // vertical bounce from walking
    atkAnim:0,         // frame-based attack animation timer (1→0)
  };
}
function resetC(c,x){
  c.x=x;c.y=FLOOR_Y-CH;c.vx=0;c.vy=0;c.hp=MAX_HP;c.alive=true;c.grounded=true;
  c.atk=false;c.atkT=0;c.atkCD=0;c.dashing=false;c.dashT=0;c.dashCD=0;
  c.tornadoAct=false;c.tornadoT=0;c.tornadoCD=0;
  c.tailAct=false;c.tailT=0;c.tailCD=0;
  c.parrying=false;c.parryT=0;c.parryCD=0;c.parryOK=false;
  c.launched=false;c.launchVy=0;c.launchVx=0;c.launchSpin=0;c.launchRot=0;c.launchIsKO=false;
  c.launchCD=0;
  c.stunned=false;c.stunT=0;
  c.frozen=false;c.frozenT=0;c.frozenCracks=0;
  c.dizzy=false;c.dizzyT=0;c.dizzyAngle=0;
  c.hitFlash=0;c.squash=1;c.stretch=1;
  c.combo=0;c.comboT=0;c.maxCombo=0;c.totalDmg=0;c.hits=0;c.parryCount=0;
  c.comebackActive=false;c.comebackFlash=0;
  c.dead=false;c.deathVx=0;c.deathVy=0;c.deathBounces=0;c.deathRot=0;c.deathRotV=0;
  c.bufAtk=false;c.bufParry=false;
  c.pow1CD=0;c.pow2CD=0;c.pow3CD=0;c.pow4CD=0;
  c.speedBoost=1;c.speedBoostT=0;
  c.shieldActive=false;c.doubleDmg=false;
  c.rageSuperUsed=false;
  c.rageCD=0;
  c.lightningCloud=0;
  c.infernoT=0;c.infernoAura=false;
  // Secret powers
  c.fireAuraT=0;c.fireAuraActive=false;c.fireAuraDmgTick=0;c.secretAuraCD=0;
  c.laserEyesT=0;c.laserEyesActive=false;c.secretLaserCD=0;c.laserDmgApplied=false;
  // Reset dive/jump state
  c.diving=false;c.diveVy=0;c.diveSpinT=0;c.diveDownTaps=0;c.diveDownTimer=0;c.diveLanded=false;
  c.jumpHeld=false;c.coyoteT=0;
  // Reset animation state
  c.animT=0;c.walkCycle=0;c.breathCycle=0;c.armAngle=0;c.armTarget=0;
  c.bodyLean=0;c.headBob=0;c.legPhaseL=0;c.legPhaseR=Math.PI;
  c.hitRecoil=0;c.stepBounce=0;c.atkAnim=0;
}

// ─── MELEE DAMAGE ───
function dealMeleeDmg(atk,vic,dir,heavy,isTail){
  if(vic.launched) return;
  if(vic.frozen) return; // can't be hit while frozen (handled by freeze expiry)
  if(vic.shieldActive&&heavy){ vic.shieldActive=false; sfxParry(); fText(vic.x+vic.w/2,vic.y-60,'BLOCKED!','#60a5fa',30,1.2); return; }
  if(vic.parrying&&vic.parryT>0){
    vic.parryOK=true;atk.stunned=true;atk.stunT=PARRY_STUN;
    hitStop(HS_PARRY);addTrauma(.38);screenFlash('rgba(139,92,246,.3)');
    sfxParry();sparks(vic.x+vic.w/2,vic.y+vic.h/2,24,'#a78bfa');
    shockwave(vic.x+vic.w/2,vic.y+vic.h/2,'rgba(139,92,246,.5)');
    lightningBolt(vic.x+vic.w/2-50,vic.y-20,vic.x+vic.w/2+50,vic.y+vic.h);
    fText(vic.x+vic.w/2,vic.y-55,pick(PARRY_LINES),'#a78bfa',30);
    vic.parryCount++;chromAb=.4;
    if(vic===p1) _dailyParryCount++;
    /* playSpecialVideo('parry', 1800); */
    return;
  }
  // ─── MELEE HP DAMAGE ───
  const meleeDmg = (heavy||isTail) ? 1 : 1; // every hit does 1 HP damage
  vic.hp = Math.max(0, vic.hp - meleeDmg);
  vic.hitFlash=.14;
  vic.hitRecoil = dir * 0.35; // Snap hit recoil animation
  const spd = atk.speedBoost>1 ? 1.3 : 1;
  vic.vx=dir*KB*(heavy?1.5:1)*spd;vic.vy=KB_UP*(heavy?1.2:1);vic.grounded=false;
  vic.combo=0;vic.comboT=0;
  atk.combo++;atk.comboT=1.5;atk.hits++;
  if(atk.combo>atk.maxCombo)atk.maxCombo=atk.combo;
  _dailyHitCount++;
  if(atk.combo>=5) _dailyComboHit=true;

  if(isTail){
    hitStop(HS_TAIL);addTrauma(.55);
    feathers(vic.x+vic.w/2,vic.y+vic.h/2,20,'#fff');
    embers(vic.x+vic.w/2,vic.y+vic.h/2,10);
    shockwave(vic.x+vic.w/2,vic.y+vic.h/2,'rgba(255,200,0,.6)');
    screenFlash('rgba(255,200,0,.2)',.12);chromAb=.35;bloomInt=.45;
    fText(vic.x+vic.w/2,vic.y-55,pick(TAIL_WORDS),'#06b6d4',34,1.2);
    /* playSpecialVideo('tailwhip', 1800); */
  } else if(heavy){
    hitStop(HS_HEAVY);addTrauma(.45);
    feathers(vic.x+vic.w/2,vic.y+vic.h/2,16,'#fff');
    embers(vic.x+vic.w/2,vic.y+vic.h/2,7);
    shockwave(vic.x+vic.w/2,vic.y+vic.h/2);
    screenFlash('rgba(255,255,255,.15)',.08);chromAb=.25;
  } else {
    hitStop(HS_LIGHT);addTrauma(.2+atk.combo*.02);
    feathers(vic.x+vic.w/2,vic.y+vic.h/2,8,'#fff');
    // Canvas brightness flash for melee
    screenFlash('rgba(255,255,255,0.08)',0.04);
  }
  sfxHit(atk.combo);
  fText(vic.x+vic.w/2+rand(-22,22),vic.y-12,`${pick(DMG_WORDS)}!`,'#fff',22);
  // Show HP damage text
  fText(vic.x+vic.w/2, vic.y-40, `-1 HP (${vic.hp}/${MAX_HP})`, '#ff6b6b', 18, 1.2);
  if(COMBO_MS[atk.combo]){
    slam(COMBO_MS[atk.combo],'#ffd740',1);sfxCombo(atk.combo);stars(atk.x+atk.w/2,atk.y,10);bloomInt=.5;
    /* playSpecialVideo('combo', 1800); */
  }
  // KO from melee — launch victim into death spin
  if(vic.hp <= 0){
    vic.launched = true;
    vic.launchVy = -600;
    vic.launchVx = dir * 200;
    vic.launchSpin = dir * 8;
    vic.launchRot = 0;
    vic.launchTimer = 0;
    vic.launchIsKO = true;
    vic.grounded = false;
    slowMo(SLO_DUR+0.5, SLO_SCALE);
    playNarr(narrKO);
    bloomInt=1;chromAb=0.6;
  }
}

// ─── USE SPECIAL POWER ───
function useSpecialPower(c, o, powerName){
  const def = POWERS[powerName];
  if(!def) return;

  if(powerName === 'freeze'){
    spawnFreezeBall(c, c.face);
    fText(c.x+c.w/2, c.y-60, 'FREEZE BALL!', '#93c5fd', 30, 1.2);
  } else if(powerName === 'sax'){
    spawnSaxWave(c, c.face);
    fText(c.x+c.w/2, c.y-60, 'SAXOPHONE!', '#ffd740', 30, 1.2);
    /* playSpecialVideo('sax', 2500); */
  } else if(powerName === 'lightning'){
    c.lightningCloud = 0.8;
    doLightningStrike(c, o);
    fText(c.x+c.w/2, c.y-60, 'LIGHTNING!', '#ffd740', 30, 1.2);
  } else if(powerName === 'mystery'){
    spawnMysteryBox();
    fText(c.x+c.w/2, c.y-60, 'MYSTERY BOX!', '#ffd740', 30, 1.2);
    sfxMystery();
  } else if(powerName === 'tornado'){
    c.tornadoAct=true;c.tornadoT=0.65;c.tornadoCD=POWERS.tornado.cd;
    sfxSpecial();slam('TORNADO!!',c===p1?'#4ade80':'#f472b6',.8);bloomInt=.4;
    /* playSpecialVideo('tornado', 2000); */
  } else if(powerName === 'tailwhip'){
    c.tailAct=true;c.tailT=.3;c.tailCD=0;sfxTailWhip();
    c.squash=1.35;c.stretch=.65;
    /* playSpecialVideo('tailwhip', 2000); */
    setTimeout(()=>{
      if(!c.alive||!o.alive||o.launched)return;
      const tcx=c.x+c.w/2,tcy=c.y+c.h/2;
      if(dist(tcx,tcy,o.x+o.w/2,o.y+o.h/2)<TAIL_RANGE)dealMeleeDmg(c,o,c.face,true,true);
    },100);
  } else if(powerName === 'shotgun'){
    spawnShotgunPillows(c, c.face);
    fText(c.x+c.w/2, c.y-60, pick(SHOTGUN_WORDS), '#ffd740', 32, 1.2);
    slam('PILLOW SHOTGUN!!','#ffd740',1);
    bloomInt=0.4;
    /* playSpecialVideo('shotgun', 2000); */
  } else if(powerName === 'uppercut'){
    doPillowUppercut(c, o);
    fText(c.x+c.w/2, c.y-60, pick(UPPERCUT_WORDS), '#ff9100', 32, 1.2);
    /* playSpecialVideo('uppercut', 2000); */
  } else if(powerName === 'boomerang'){
    spawnBoomerangPillow(c, c.face);
    fText(c.x+c.w/2, c.y-60, pick(BOOMERANG_WORDS), '#a78bfa', 32, 1.2);
    slam('BOOMERANG!!','#a78bfa',1);
    /* playSpecialVideo('boomerang', 2000); */
  } else if(powerName === 'rapidfire'){
    spawnRapidFirePillows(c, c.face);
    fText(c.x+c.w/2, c.y-60, pick(RAPIDFIRE_WORDS), '#ff6b35', 32, 1.2);
    slam('RAPID FIRE!!','#ff6b35',1);
    bloomInt=0.3;
    /* playSpecialVideo('rapidfire', 2000); */
  } else if(powerName === 'inferno'){
    activateInferno(c, o);
  }
}

// ─── INFERNO: Colosseum-Exclusive Ultimate ───
function activateInferno(c, o){
  // Set self on fire for 5 seconds
  c.infernoT = 5.0;
  c.infernoAura = true;
  // Screen shake + flash
  addTrauma(0.7);
  screenFlash('rgba(255,80,0,0.5)', 0.4);
  bloomInt = 1.0;
  chromAb = 0.6;
  // Epic slam text
  slam('INFERNO!!', '#ff4400', 2.5);
  sfxSpecial();
  fText(c.x+c.w/2, c.y-80, '☄️ INFERNO!!', '#ff4400', 44, 2);
  // Initial fire burst particles
  const cx = c.x+c.w/2, cy = c.y+c.h/2;
  embers(cx, cy, 40, '#ff4400');
  sparks(cx, cy, 25, '#ffd740');
  shockwave(cx, cy, 'rgba(255,68,0,.7)');
  // Broadcast to guest
  hostSendEvent({type:'slam', text:'INFERNO!!', color:'#ff4400', dur:2.5});
  hostSendEvent({type:'sfx', name:'special'});
  // After 0.8s build-up, launch the massive fireball
  setTimeout(() => {
    if(!c.alive || state !== 'fight') return;
    spawnInfernoFireball(c, o);
  }, 800);
}

function spawnInfernoFireball(c, o){
  const cx = c.x + c.w/2, cy = c.y + c.h*0.35;
  const face = c.face;
  // Giant fireball projectile
  projectiles.push({
    x: cx + face*40, y: cy,
    vx: face * 420, vy: -40,
    w: 100, h: 80,
    owner: c, face, alive: true, rot: 0, trail: [],
    type: 'pillow', isDouble: true, isMega: true, isInferno: true,
    dmg: 5 // special damage override
  });
  // Explosion effects at launch point
  addTrauma(0.5);
  embers(cx, cy, 30, '#ff6a00');
  sparks(cx, cy, 20, '#ffd740');
  shockwave(cx, cy, 'rgba(255,100,0,.6)');
  shockwave(cx, cy, 'rgba(255,200,0,.4)');
  fText(cx, cy-40, '🔥 FIREBALL!!', '#ffd740', 36, 1.5);
  slam('MEGA FIREBALL!!', '#ffd740', 1.5);
  hostSendEvent({type:'slam', text:'MEGA FIREBALL!!', color:'#ffd740', dur:1.5});
}

// ─── MEGA PILLOW BOMB (Desperation Super) ───
// ─── SECRET SEQUENCE TRACKER ───
// Tracks recent key presses per player for secret combos
const _seqBuf = { p1:[], p2:[] };
const SEQ_MAX = 10; // max buffer length
const CD_SECRET_AURA = 25; // cooldown for fireball aura secret
const CD_SECRET_LASER = 15; // cooldown for laser eyes secret

function pushSeq(player, key){
  const buf = _seqBuf[player];
  buf.push(key);
  if(buf.length > SEQ_MAX) buf.shift();
}
function checkSeq(player, pattern){
  const buf = _seqBuf[player];
  if(buf.length < pattern.length) return false;
  const tail = buf.slice(-pattern.length);
  return tail.every((k,i) => k === pattern[i]);
}
function clearSeq(player){ _seqBuf[player] = []; }

// Secret combo patterns
const SEQ_FIREBALL_AURA = ['l','p','l','p','l','p']; // LPLPLP
const SEQ_LASER_EYES = ['0','0','0','0']; // 0000

// ─── SECRET POWER: FIREBALL AURA (LPLPLP) ───
// Croc bursts into a MASSIVE fireball aura — much bigger than inferno
// Damages opponent on proximity contact
function activateFireballAura(c, o){
  if(c.fireAuraT > 0) return; // already active
  c.fireAuraT = 8.0; // 8 seconds of massive fire
  c.fireAuraActive = true;
  c.secretAuraCD = CD_SECRET_AURA;
  c.fireAuraDmgTick = 0;
  // Epic effects
  addTrauma(0.9);
  screenFlash('rgba(255,40,0,0.6)', 0.5);
  bloomInt = 1.2; chromAb = 0.8;
  slam('\u{1F525} FIREBALL AURA!! \u{1F525}', '#ff2200', 3);
  sfxSpecial();
  const cx = c.x+c.w/2, cy = c.y+c.h/2;
  // Massive explosion burst
  embers(cx, cy, 60, '#ff2200');
  embers(cx, cy, 40, '#ffd740');
  sparks(cx, cy, 40, '#ff6a00');
  shockwave(cx, cy, 'rgba(255,40,0,.9)');
  shockwave(cx, cy, 'rgba(255,200,0,.6)');
  fText(cx, cy-100, '\u{1F525} SECRET POWER!!', '#ff2200', 48, 2.5);
  hostSendEvent({type:'slam', text:'\u{1F525} FIREBALL AURA!! \u{1F525}', color:'#ff2200', dur:3});
  hostSendEvent({type:'sfx', name:'special'});
}

// ─── SECRET POWER: LASER EYES (0000 while fire aura active) ───
// Eyes turn bright blue and shoot lasers that do -5 damage
function activateLaserEyes(c, o){
  if(!c.fireAuraActive) return; // must be in fire aura
  if(c.laserEyesT > 0) return; // already active
  c.laserEyesT = 3.0; // 3 seconds of laser beams
  c.laserEyesActive = true;
  c.secretLaserCD = CD_SECRET_LASER;
  c.laserDmgApplied = false;
  // Effects
  addTrauma(0.6);
  screenFlash('rgba(0,150,255,0.5)', 0.3);
  bloomInt = 1.0; chromAb = 0.5;
  slam('\u{1F4A0} LASER EYES!! \u{1F4A0}', '#00ccff', 2.5);
  sfxSpecial();
  fText(c.x+c.w/2, c.y-90, '\u{1F4A0} LASER EYES!!', '#00ccff', 44, 2);
  hostSendEvent({type:'slam', text:'\u{1F4A0} LASER EYES!! \u{1F4A0}', color:'#00ccff', dur:2.5});
  hostSendEvent({type:'sfx', name:'special'});
  // Instant -5 damage to opponent
  o.hp = Math.max(0, o.hp - 5);
  if(o.hp <= 0) o.alive = false;
  hitStop(0.25);
  addTrauma(0.4);
  fText(o.x+o.w/2, o.y-40, '-5 LASER!!', '#00ccff', 36, 1.5);
  sparks(o.x+o.w/2, o.y+o.h/2, 30, '#00ccff');
  embers(o.x+o.w/2, o.y+o.h/2, 20, '#0088ff');
}

// Update secret power timers each frame (called from updateCroc)
function updateSecretPowers(c, o, dt){
  // Fireball Aura countdown
  if(c.fireAuraActive){
    c.fireAuraT -= dt;
    if(c.fireAuraT <= 0){
      c.fireAuraActive = false;
      c.fireAuraT = 0;
      c.laserEyesActive = false;
      c.laserEyesT = 0;
      fText(c.x+c.w/2, c.y-60, 'AURA FADED', '#ff6a00', 24, 1);
    } else {
      // Proximity damage: if opponent is within range, damage them
      c.fireAuraDmgTick = (c.fireAuraDmgTick||0) - dt;
      if(c.fireAuraDmgTick <= 0){
        const dist = Math.abs((c.x+c.w/2) - (o.x+o.w/2));
        const vdist = Math.abs((c.y+c.h/2) - (o.y+o.h/2));
        if(dist < 100 && vdist < 80 && o.alive && !o.invincible){
          o.hp = Math.max(0, o.hp - 1);
          if(o.hp <= 0) o.alive = false;
          fText(o.x+o.w/2, o.y-30, '\u{1F525}-1', '#ff4400', 22, 0.8);
          embers(o.x+o.w/2, o.y+o.h/2, 5, '#ff4400');
          addTrauma(0.15);
        }
        c.fireAuraDmgTick = 0.5; // tick every 0.5s
      }
      // Fire particles (massive)
      const cx = c.x+c.w/2, cy = c.y+c.h/2;
      if(!PERF_LOW || _frameCount%2===0){
        embers(cx, cy-20, 3, Math.random()>.5?'#ff2200':'#ffd740');
      }
    }
  }
  // Cooldown ticks
  if(c.secretAuraCD > 0) c.secretAuraCD -= dt;
  if(c.secretLaserCD > 0) c.secretLaserCD -= dt;
  // Laser Eyes countdown
  if(c.laserEyesActive){
    c.laserEyesT -= dt;
    if(c.laserEyesT <= 0){
      c.laserEyesActive = false;
      c.laserEyesT = 0;
    }
  }
}

function megaPillowBomb(attacker, victim){
  attacker.rageCD = CD_RAGE;
  sfxMegaBomb();
  addTrauma(1.0);
  hitStop(0.3);
  screenFlash('rgba(255,100,255,0.6)',0.3);
  slam('MEGA PILLOW BOMB!!','#f472b6',2);
  bloomInt=1;chromAb=0.8;
  /* playSpecialVideo('video/special-ko.mp4', 2500); */
  // Giant explosion
  feathers(attacker.x+attacker.w/2,attacker.y+attacker.h/2,100,'#fff');
  sparks(attacker.x+attacker.w/2,attacker.y+attacker.h/2,50,'#f472b6');
  stars(attacker.x+attacker.w/2,attacker.y+attacker.h/2,30);
  shockwave(attacker.x+attacker.w/2,attacker.y+attacker.h/2,'rgba(244,114,182,0.8)');
  shockwave(attacker.x+attacker.w/2,attacker.y+attacker.h/2,'rgba(255,255,255,0.6)');
  // Giant pillow projectile
  const face = attacker.face;
  const px = attacker.x+attacker.w/2+face*60, py = attacker.y+attacker.h*0.35;
  projectiles.push({x:px,y:py,vx:face*600,vy:-80,w:120,h:90,owner:attacker,face,alive:true,rot:0,trail:[],type:'pillow',isDouble:true,isMega:true});
  fText(attacker.x+attacker.w/2, attacker.y-70, 'MEGA BOMB!!', '#f472b6', 44, 2);
}

// ─── UPDATE CROC ───
function updateCroc(c,inp,o,dt){
  // Safety: clear frozen state if dead
  if(c.dead && c.frozen){ c.frozen=false; c.frozenT=0; c.frozenCracks=0; }
  if(c.launched){updateLaunched(c,dt);return}

  c.atkCD=Math.max(0,c.atkCD-dt);
  c.dashCD=Math.max(0,c.dashCD-dt);
  c.tornadoCD=Math.max(0,c.tornadoCD-dt);
  c.tailCD=Math.max(0,c.tailCD-dt);
  c.parryCD=Math.max(0,c.parryCD-dt);
  c.hitFlash=Math.max(0,c.hitFlash-dt);
  c.launchCD=Math.max(0,c.launchCD-dt);
  c.pow1CD=Math.max(0,c.pow1CD-dt);c.pow3CD=Math.max(0,c.pow3CD-dt);c.pow4CD=Math.max(0,c.pow4CD-dt);
  c.rageCD=Math.max(0,c.rageCD-dt);
  c.pow2CD=Math.max(0,c.pow2CD-dt);
  c.squash=lerp(c.squash,1,dt*10);
  c.stretch=lerp(c.stretch,1,dt*10);
  c.comboT=Math.max(0,c.comboT-dt);if(c.comboT<=0)c.combo=0;

  // Lightning cloud decay
  if(c.lightningCloud>0) c.lightningCloud=Math.max(0,c.lightningCloud-dt*2.5);

  // Inferno fire aura update — emit fire particles while active
  if(c.infernoAura){
    c.infernoT -= dt;
    if(c.infernoT <= 0){
      c.infernoAura = false;
      c.infernoT = 0;
    } else {
      // Continuous fire particles around character
      const cx = c.x+c.w/2, cy = c.y+c.h/2;
      if(!PERF_LOW || _frameCount%3===0){
        embers(cx, cy-20, 2, Math.random()>.5?'#ff4400':'#ffd740');
      }
    }
  }

  // Secret powers update (Colosseum)
  updateSecretPowers(c, o, dt);

  // Frozen update
  if(c.frozen){
    c.frozenT-=dt;
    if(c.frozenT<=0){ c.frozen=false; fText(c.x+c.w/2,c.y-60,'FREE!','#93c5fd',28,1); }
    // Frozen croc can't do anything
    c.vx*=0.8;c.vy+=GRAVITY*dt;c.y+=c.vy*dt;
    const fp=checkPlatformLand(c);if(fp!==null&&c.vy>0){c.y=fp-c.h;c.vy=0;c.grounded=true}
    if(c.y+c.h>FLOOR_Y){c.y=FLOOR_Y-c.h;c.vy=0;c.grounded=true}
    c.x=clamp(c.x,10,AW-c.w-10);
    return;
  }

  // Dizzy update
  if(c.dizzy){ c.dizzyT-=dt; c.dizzyAngle=Math.sin(Date.now()*0.015)*0.18; if(c.dizzyT<=0){c.dizzy=false;c.dizzyAngle=0;} }

  // Speed boost decay
  if(c.speedBoostT>0){ c.speedBoostT-=dt; if(c.speedBoostT<=0){c.speedBoost=1;} }

  // Mystery box auto-pickup on walk-over (no button needed)
  if(mysteryBox) checkMysteryPickup(c, o);

  const wasCB=c.comebackActive;
  c.comebackActive=c.hp<=COMEBACK_TH&&c.alive;
  if(c.comebackActive&&!wasCB){sfxComeback();fText(c.x+c.w/2,c.y-60,pick(COMEBACK_LINES),'#ff3d00',30);vignette('rgba(255,0,0,.25)',.5)}
  if(c.comebackActive)c.comebackFlash+=dt*6;

  // Rage mode trigger
  if(c.hp<=1&&!c.rageModeShown&&c.alive){
    c.rageModeShown=true;
    slam('RAGE MODE!!','#ff0000',1.8);
    sfxRage();
    addTrauma(0.6);
    screenFlash('rgba(255,0,0,0.3)',0.2);
    vignette('rgba(255,0,0,.4)',0.8);
    /* playSpecialVideo('video/special-ko.mp4', 2000); */
  }

  const rageSpeedMult = (c.hp<=1&&c.alive) ? 1.2 : 1;
  const rageAtkMult  = (c.hp<=1&&c.alive) ? 1.3 : 1;

  if(c.dead){
    c.deathRot+=c.deathRotV*dt;c.x+=c.deathVx*dt;c.y+=c.deathVy*dt;c.deathVy+=GRAVITY*1.3*dt;
    if(c.x<10){c.x=10;c.deathVx*=-.5;addTrauma(.2);sfxBounce()}
    if(c.x+c.w>AW-10){c.x=AW-c.w-10;c.deathVx*=-.5;addTrauma(.2);sfxBounce()}
    if(c.y+c.h>FLOOR_Y){c.y=FLOOR_Y-c.h;c.deathVy*=-.3;c.deathVx*=.6;if(Math.abs(c.deathVy)>20){addTrauma(.1);sfxBounce()}}
    return;
  }
  if(!c.alive)return;

  if(c.stunned){c.stunT-=dt;if(c.stunT<=0)c.stunned=false;c.vx*=.85;c.vy+=GRAVITY*dt;c.x+=c.vx*dt;c.y+=c.vy*dt;
    const sp=checkPlatformLand(c);if(sp!==null&&c.vy>0){c.y=sp-c.h;c.vy=0;c.grounded=true}
    if(c.y+c.h>FLOOR_Y){c.y=FLOOR_Y-c.h;c.vy=0;c.grounded=true}c.x=clamp(c.x,10,AW-c.w-10);return}

  if(c.parrying){c.parryT-=dt;if(c.parryT<=0){c.parrying=false;if(!c.parryOK)c.parryCD=PARRY_CD}c.parryOK=false}

  let mx=0;if(inp.left)mx-=1;if(inp.right)mx+=1;
  if(c.dizzy) mx *= (0.5+Math.sin(Date.now()*0.01)*0.5); // wobbly movement

  // ─── COYOTE TIME (6 frames of grace after leaving ground) ───
  if(c.grounded) c.coyoteT = 0.1;
  else c.coyoteT = Math.max(0, c.coyoteT - dt);

  // ─── VARIABLE HEIGHT JUMP ───
  const canJump = c.grounded || c.coyoteT > 0;
  if(inp.up && canJump && !c.diving){
    const jumpMult = activeMutator.id === 'lowgrav' ? 0.75 : 1;
    c.vy = JUMP_VEL * jumpMult;
    c.grounded=false; c.coyoteT=0; c.jumpHeld=true;
    c.squash=.55; c.stretch=1.45;
    sfxBounce(); shockwave(c.x+c.w/2,c.y+c.h);
    c.diveDownTaps=0; c.diveDownTimer=0;
  }
  // Cut jump short if button released early (variable height)
  if(!inp.up && c.jumpHeld && c.vy < 0){
    c.vy *= 0.5; // halve upward velocity = shorter jump
    c.jumpHeld = false;
  }
  if(c.grounded) c.jumpHeld = false;

  // ─── POWER PILLOW DRIVE (double-tap down while airborne) ───
  if(!c.grounded && !c.diving && inp.down){
    c.diveDownTaps++;
    if(c.diveDownTaps >= 2 && c.diveDownTimer > 0){
      // Activate dive
      c.diving = true;
      c.diveVy = 900; // fast downward
      c.diveSpinT = 0;
      c.diveLanded = false;
      c.vy = c.diveVy;
      c.vx = 0; // lock horizontal during dive
      sfxSpecial();
      fText(c.x+c.w/2, c.y-40, 'POWER DIVE!!', '#ff6b35', 34, 1.5);
      /* playSpecialVideo('tornado', 1500); */
    }
    c.diveDownTimer = 0.35; // 350ms window for double-tap
  }
  if(c.diveDownTimer > 0) c.diveDownTimer -= dt;
  if(c.grounded){ c.diveDownTaps = 0; c.diveDownTimer = 0; }

  // ─── DIVE PHYSICS ───
  if(c.diving){
    c.diveSpinT += dt * 20; // fast spin
    c.vy = c.diveVy; // override gravity during dive — straight down
    c.vx *= 0.9; // dampen horizontal
    // Dive landing (check platform first, then floor)
    const divePlatY = checkPlatformLand(c);
    const diveLandY = divePlatY !== null ? divePlatY : FLOOR_Y;
    if(c.y + c.h >= diveLandY && !c.diveLanded){
      c.diveLanded = true;
      c.diving = false;
      c.y = diveLandY - c.h;
      c.vy = 0;
      c.grounded = true;
      // BRICK EXPLOSION EFFECT
      addTrauma(0.7); hitStop(0.15);
      screenFlash('rgba(255,100,0,.4)', 0.15);
      slam('GROUND POUND!!', '#ff6b35', 1.5);
      bloomInt = 0.6;
      sfxMegaBomb();
      // Brick debris particles
      for(let i=0;i<30;i++){
        const a = rand(-Math.PI, 0); // upward arc
        const s = rand(120, 400);
        const brickCol = pick(['#8B6914','#A0522D','#CD853F','#D2691E','#B8860B','#666']);
        parts.push({x:c.x+c.w/2+rand(-40,40), y:FLOOR_Y-5, vx:Math.cos(a)*s, vy:Math.sin(a)*s,
          life:rand(.6,1.4), ml:1.4, col:brickCol, sz:rand(4,12), tp:'rect', rot:rand(0,TAU), rv:rand(-15,15), grav:1.2});
      }
      // Dust clouds
      for(let i=0;i<8;i++){
        const dx = rand(-80,80);
        parts.push({x:c.x+c.w/2+dx, y:FLOOR_Y-10, vx:dx*2, vy:rand(-30,-80),
          life:rand(.4,.8), ml:.8, col:'rgba(180,160,120,.5)', sz:rand(15,30), tp:'circle', rot:0, rv:0, grav:0.1});
      }
      shockwave(c.x+c.w/2, FLOOR_Y, 'rgba(255,150,0,.7)');
      shockwave(c.x+c.w/2, FLOOR_Y, 'rgba(255,255,255,.4)');
      feathers(c.x+c.w/2, FLOOR_Y-20, 20, '#fff');
      // DAMAGE if near enemy
      const diveDist = dist(c.x+c.w/2, FLOOR_Y, o.x+o.w/2, o.y+o.h/2);
      if(diveDist < 250 && o.alive && !o.launched){
        _dailyHitCount++;
        if(diveDist < 120){
          // ─── DIRECT HIT: landed ON opponent → SMASH PIN for 3s + 2 HP ───
          const dmg = 2;
          o.hp = Math.max(0, o.hp - dmg);
          o.hitFlash = 0.3;
          // Pin the opponent flat (use stun system)
          o.stunned = true; o.stunT = 3.0;
          o.squash = 2.0; o.stretch = 0.3; // squished flat
          o.vx = 0; o.vy = 0;
          o.grounded = true;
          o.y = FLOOR_Y - o.h; // pin to floor
          fText(o.x+o.w/2, o.y-50, 'SMASHED!! -' + dmg + ' HP', '#ff3d00', 38, 2);
          slam('PILE DRIVE!!', '#ff3d00', 2);
          screenFlash('rgba(255,60,0,.4)', 0.2);
          addTrauma(0.9);
          hitStop(0.25);
          // Extra impact effects
          sparks(o.x+o.w/2, FLOOR_Y-20, 30, '#ff6b35');
          stars(o.x+o.w/2, FLOOR_Y-20, 15);
          _dailyDiveKill = o.hp <= 0;
          if(o.hp <= 0){
            o.stunned=false; o.stunT=0;
            o.launched=true; o.launchVy=-600; o.launchVx=(o.x>c.x?1:-1)*200;
            o.launchSpin=(o.x>c.x?1:-1)*8; o.launchRot=0; o.launchTimer=0; o.launchIsKO=true;
            slowMo(SLO_DUR+0.5, SLO_SCALE); bloomInt=1; chromAb=0.6;
          }
        } else {
          // ─── NEARBY: shockwave splash → -1 HP + knockback ───
          const dmg = 1;
          o.hp = Math.max(0, o.hp - dmg);
          o.hitFlash = 0.2;
          o.vx = (o.x+o.w/2 > c.x+c.w/2 ? 1 : -1) * 350;
          o.vy = -300;
          o.grounded = false;
          fText(o.x+o.w/2, o.y-50, 'QUAKE!! -1 HP', '#ff6b35', 30, 1.2);
          _dailyDiveKill = o.hp <= 0;
          if(o.hp <= 0){
            o.launched=true; o.launchVy=-600; o.launchVx=(o.x>c.x?1:-1)*200;
            o.launchSpin=(o.x>c.x?1:-1)*8; o.launchRot=0; o.launchTimer=0; o.launchIsKO=true;
            slowMo(SLO_DUR+0.5, SLO_SCALE); bloomInt=1; chromAb=0.6;
          }
        }
      }
      c.squash = 1.5; c.stretch = 0.5;
    }
  }

  const spd = MOVE_SPD * c.speedBoost * rageSpeedMult;
  if(c.dashing){c.dashT-=dt;c.vx=c.dashDir*DASH_SPD;if(c.dashT<=0)c.dashing=false}
  else if(!c.tornadoAct&&!c.tailAct) c.vx=mx*spd;

  // Attack (melee smack) — skeletal arm swing animation
  if(inp.attack&&c.atkCD<=0&&!c.atk&&!c.tornadoAct&&!c.parrying&&!c.tailAct){
    c.atk=true;c.atkT=ATK_TOTAL;c.atkAnim=1.0;c.atkCD=ATK_CD/rageAtkMult;sfxHit(c.combo);
    c.squash=1.15;c.stretch=.88;
    c._hitChecked=false; // delay hit check to swing phase
  }
  if(c.atk){
    c.atkT-=dt;c.atkAnim=clamp(c.atkT/ATK_TOTAL,0,1);
    // Check hit during the swing phase (after anticipation)
    if(!c._hitChecked && c.atkAnim < 1-(ATK_ANTIC/ATK_TOTAL)){
      c._hitChecked=true;
      const acx=c.x+c.w/2+c.face*90,acy=c.y+c.h/2;
      if(dist(acx,acy,o.x+o.w/2,o.y+o.h/2)<ATK_RANGE&&o.alive&&!o.launched)dealMeleeDmg(c,o,c.face,false,false);
    }
    if(c.atkT<=0){c.atk=false;c.atkAnim=0;}
  }

  // PILLOW LAUNCH
  if(inp.launch&&c.launchCD<=0&&!c.tornadoAct&&!c.tailAct&&!c.atk&&!c.parrying&&!c.dashing){
    c.launchCD=LAUNCH_CD;
    c.squash=.7;c.stretch=1.35;
    spawnPillow(c, c.face, c.doubleDmg, activeMutator.id==='bigpillows');
    if(c.doubleDmg) c.doubleDmg=false;
  }

  // Parry
  if(inp.parry&&c.parryCD<=0&&!c.parrying&&!c.atk&&!c.tornadoAct&&!c.tailAct){c.parrying=true;c.parryT=PARRY_WIN;c.parryOK=false;c.parryCD=0}

  // Dash (belly bounce)
  if(inp.dash&&c.dashCD<=0&&!c.dashing&&!c.tornadoAct&&!c.tailAct){
    c.dashing=true;c.dashT=DASH_DUR;c.dashCD=DASH_CD;c.dashDir=c.face;c.squash=1.45;c.stretch=.55;sfxDash();
    setTimeout(()=>{if(!c.alive||!o.alive||o.launched)return;if(dist(c.x+c.w/2,c.y+c.h/2,o.x+o.w/2,o.y+o.h/2)<100)dealMeleeDmg(c,o,c.dashDir,true,false)},70);
  }

  // Tornado
  if(c.tornadoAct){
    c.tornadoT-=dt;c.vx=c.face*160;
    if(dist(c.x+c.w/2,c.y+c.h/2,o.x+o.w/2,o.y+o.h/2)<110&&o.alive&&!o.launched&&Math.random()<dt*8)dealMeleeDmg(c,o,c.face,false,false);
    feathers(c.x+c.w/2+rand(-22,22),c.y+c.h/2+rand(-14,14),1,c===p1?'#4ade80':'#f472b6');
    if(c.tornadoT<=0)c.tornadoAct=false;
  }

  // RAGE — featured ability on 15s cooldown
  if(inp.rage&&c.rageCD<=0&&!c.parrying&&c.alive){
    megaPillowBomb(c,o);
    if(c===p1) _dailyRageCount++;
  }

  // POWER 1
  if(inp.power1&&c.pow1CD<=0&&!c.parrying){
    const def=POWERS[c.power1];
    if(def){ c.pow1CD=def.cd; useSpecialPower(c,o,c.power1); }
  }
  // POWER 2
  if(inp.power2&&c.pow2CD<=0&&!c.parrying){
    const def=POWERS[c.power2];
    if(def){ c.pow2CD=def.cd; useSpecialPower(c,o,c.power2); }
  }
  if(inp.power3&&c.power3&&c.pow3CD<=0&&!c.parrying){
    const def=POWERS[c.power3];
    if(def){ c.pow3CD=def.cd; useSpecialPower(c,o,c.power3); }
  }
  if(inp.power4&&c.power4&&c.pow4CD<=0&&!c.parrying){
    const def=POWERS[c.power4];
    if(def){ c.pow4CD=def.cd; useSpecialPower(c,o,c.power4); }
  }

  // Mutator gravity
  const gravMult = activeMutator.id === 'lowgrav' ? 0.4 : 1;
  const spdMult = activeMutator.id === 'turbo' ? 1.6 : 1;
  if(!c.diving) c.vy += GRAVITY * gravMult * dt;
  c.x += c.vx * spdMult * dt;
  c.y += c.vy * dt;
  // Platform landing (one-way — only when falling)
  const platY = checkPlatformLand(c);
  if(platY !== null && c.vy > 0){
    c.y = platY - c.h;
    if(c.vy > 130){ c.squash = 1.3; c.stretch = .7; sfxBounce(); }
    c.vy = 0; c.grounded = true;
  }
  if(c.y+c.h>FLOOR_Y){c.y=FLOOR_Y-c.h;if(c.vy>130){c.squash=1.3;c.stretch=.7;sfxBounce();shockwave(c.x+c.w/2,FLOOR_Y)}c.vy=0;c.grounded=true}
  // Fall off platform when walking past edge
  if(c.grounded && !isOnPlatform(c) && c.y + c.h < FLOOR_Y - 5){ c.grounded = false; c.coyoteT = 0.1; }
  c.x=clamp(c.x,10,AW-c.w-10);
  if(!c.dashing&&!c.tornadoAct&&!c.tailAct)c.face=(o.x+o.w/2>c.x+c.w/2)?1:-1;

  // ─── BODY COLLISION — no walk-through, only jump over ───
  if(o.alive && !o.launched && c.alive && !c.launched){
    const cx1=c.x, cx2=c.x+c.w*0.5; // use inner half for collision
    const ox1=o.x+o.w*0.25, ox2=o.x+o.w*0.75;
    const overlapX = Math.min(cx2, ox2) - Math.max(cx1+c.w*0.25, ox1);
    // Only block on ground level (allow jumping over)
    const bothGrounded = c.grounded && o.grounded;
    const sameLevel = Math.abs((c.y+c.h) - (o.y+o.h)) < 40;
    if(overlapX > 0 && (bothGrounded || sameLevel) && !c.diving){
      const push = overlapX * 0.6;
      if(c.x < o.x) c.x -= push;
      else c.x += push;
      c.x = clamp(c.x, 10, AW-c.w-10);
    }
  }

  // ─── PROCEDURAL ANIMATION TICK ───
  c.animT += dt;
  const isMoving = Math.abs(c.vx) > 15;
  const walkSpeed = Math.abs(c.vx) / 120; // normalized 0-1+

  // Walk cycle — advances when moving
  if(isMoving && c.grounded){
    c.walkCycle += dt * 10 * Math.min(walkSpeed, 1.8);
    c.legPhaseL = c.walkCycle;
    c.legPhaseR = c.walkCycle + Math.PI;
    c.stepBounce = Math.abs(Math.sin(c.walkCycle)) * 6 * Math.min(walkSpeed, 1);
    c.bodyLean = lerp(c.bodyLean, clamp(c.vx * 0.0008, -0.12, 0.12), dt * 8);
  } else {
    c.stepBounce = lerp(c.stepBounce, 0, dt * 12);
    c.bodyLean = lerp(c.bodyLean, 0, dt * 6);
    c.legPhaseL = lerp(c.legPhaseL, 0, dt * 5);
    c.legPhaseR = lerp(c.legPhaseR, Math.PI, dt * 5);
  }

  // Breathing — always ticks (slower when idle, faster in rage)
  const breathRate = (c.hp <= 1 && c.alive) ? 4.5 : (isMoving ? 3.0 : 1.8);
  c.breathCycle += dt * breathRate;

  // Arm swing — tracks attack, idle sway, or walking arm pump
  if(c.atk && c.atkT > 0){
    c.armTarget = -0.65; // big swing forward
  } else if(isMoving && c.grounded){
    c.armTarget = Math.sin(c.walkCycle) * 0.25 * Math.min(walkSpeed, 1);
  } else {
    c.armTarget = Math.sin(c.breathCycle * 0.7) * 0.06;
  }
  c.armAngle = lerp(c.armAngle, c.armTarget, dt * 18);

  // Head bob — vertical oscillation
  if(isMoving && c.grounded){
    c.headBob = Math.sin(c.walkCycle * 2) * 3 * Math.min(walkSpeed, 1);
  } else {
    c.headBob = Math.sin(c.breathCycle) * 1.5;
  }

  // Hit recoil — snaps then decays
  c.hitRecoil = lerp(c.hitRecoil, 0, dt * 10);

  // Crowd ambience scales with combo — only during active gameplay, muted during videos
  if(!videoPlaying && !matchIntroPlaying){
    setCrowdVolume(0.02 + clamp(c.combo/20,0,1)*0.04);
  }
}

// ─── AI ───
function getAI(ai,tgt){
  const inp={left:0,right:0,up:0,attack:0,dash:0,parry:0,tailwhip:0,launch:0,power1:0,power2:0,rage:0};
  const dx=tgt.x-ai.x,adx=Math.abs(dx);
  const hpRatio = ai.hp / MAX_HP; // 0-1, lower = more desperate
  const losing = ai.hp < tgt.hp;
  const aggro = losing ? 1.6 : 1.0; // More aggressive when behind

  // Movement — approach, dodge projectiles, strafe
  if(adx>180){if(dx>0)inp.right=1;else inp.left=1}
  else if(adx<60&&Math.random()<0.15){if(dx>0)inp.left=1;else inp.right=1} // dodge out
  else if(adx>=60&&adx<=180&&Math.random()<0.04){ // strafe randomly
    if(Math.random()<0.5)inp.left=1;else inp.right=1;
  }

  // Jump more often — dodge + aerial attacks
  if(ai.grounded&&Math.random()<0.008*aggro)inp.up=1;
  // Dodge jump when player attacks close
  if(tgt.atk&&adx<130&&ai.grounded&&Math.random()<0.04)inp.up=1;

  // Attack — much more aggressive
  if(adx<120&&ai.atkCD<=0&&Math.random()<0.12*aggro)inp.attack=1;

  // Parry — react to incoming attacks (smarter timing)
  if(tgt.atk&&tgt.atkT>.08&&adx<120&&ai.parryCD<=0&&Math.random()<0.06*aggro)inp.parry=1;
  // Parry incoming projectiles
  if(projectiles.some(p=>p.owner===tgt&&Math.abs(p.x-(ai.x+ai.w/2))<150)&&ai.parryCD<=0&&Math.random()<0.05)inp.parry=1;

  // Dash — offensive and defensive
  if(adx<200&&adx>60&&ai.dashCD<=0&&Math.random()<0.012*aggro)inp.dash=1;
  // Dash away when low HP
  if(hpRatio<=0.35&&adx<100&&ai.dashCD<=0&&Math.random()<0.02)inp.dash=1;

  // Launch pillows more often
  if(ai.launchCD<=0&&adx<350&&Math.random()<0.008*aggro)inp.launch=1;

  // Retreat when very low HP
  if(ai.hp<=1&&adx<140){inp.left=dx>0?1:0;inp.right=dx<0?1:0}

  // Special powers — use them much more actively
  const pow1Name = ai.power1;
  const pow2Name = ai.power2;
  const rangedPowers = ['freeze','sax','lightning','shotgun','boomerang','rapidfire'];
  const meleePowers = ['tornado','tailwhip','uppercut'];
  if(ai.pow1CD<=0){
    const isRanged = rangedPowers.includes(pow1Name);
    const isMelee = meleePowers.includes(pow1Name);
    const chance = (isRanged && adx > 120 && adx < 450) ? 0.015*aggro :
                   (isMelee && adx < 200) ? 0.012*aggro :
                   (pow1Name==='mystery' && !mysteryBox) ? 0.008 : 0.006;
    if(Math.random()<chance) inp.power1=1;
  }
  if(ai.pow2CD<=0&&!inp.power1&&!inp.power3&&!inp.power4){
    const isRanged = rangedPowers.includes(pow2Name);
    const isMelee = meleePowers.includes(pow2Name);
    const chance = (isRanged && adx > 120 && adx < 450) ? 0.012*aggro :
                   (isMelee && adx < 200) ? 0.010*aggro :
                   (pow2Name==='mystery' && !mysteryBox) ? 0.006 : 0.005;
    if(Math.random()<chance) inp.power2=1;
  }
  // AI: use power3/power4 if available
  if(ai.power3&&ai.pow3CD<=0&&!inp.power1&&!inp.power2){
    const def3=POWERS[ai.power3];
    if(def3){
      let chance3=0.02;
      if(dx<300) chance3=0.06;
      if(Math.random()<chance3) inp.power3=1;
    }
  }
  if(ai.power4&&ai.pow4CD<=0&&!inp.power1&&!inp.power2&&!inp.power3){
    const def4=POWERS[ai.power4];
    if(def4){
      let chance4=0.02;
      if(dx<300) chance4=0.06;
      if(Math.random()<chance4) inp.power4=1;
    }
  }

  // Rage — use more aggressively, especially when losing
  if(ai.rageCD<=0&&adx<300&&Math.random()<0.005*aggro) inp.rage=1;

  // Power Pillow Drive — AI uses it when above opponent
  if(!ai.grounded && ai.y < tgt.y - 50 && adx < 120 && Math.random() < 0.02) inp.down=1;

  // Mystery box — walk toward it to auto-pickup
  if(mysteryBox&&dist(ai.x+ai.w/2,ai.y+ai.h/2,mysteryBox.x,mysteryBox.y)<200){
    const mdx=mysteryBox.x-(ai.x+ai.w/2);
    if(mdx>0)inp.right=1;else inp.left=1;
  }

  return inp;
}

// ─── GAME STATE ───
let state='title',isAI=false,isOnline=false,amHost=false,p1,p2,roundTimer,roundNum,cdTimer,lastTS=0,gameTime=0,matchStats={};
let pendingIsAI = false;
let remoteInput = {left:false,right:false,up:false,down:false,attack:false,dash:false,parry:false,launch:false,power1:false,power2:false,power3:false,power4:false,rage:false};

// Buffer one-shot inputs for online guest so touch taps aren't missed between frames
let guestInputBuf = {up:false,down:false,attack:false,dash:false,parry:false,launch:false,power1:false,power2:false,power3:false,power4:false,rage:false};

function grantInfernoIfColosseum(c, lo){
  // In the Colosseum arena, both players get Inferno as a bonus power
  if(currentArena.id === 'colosseum'){
    if(!lo.power3) lo.power3 = 'inferno';
    else if(!lo.power4) lo.power4 = 'inferno';
    // If all slots full, replace power4 with inferno
    else if(lo.power3 !== 'inferno' && lo.power4 !== 'inferno') lo.power4 = 'inferno';
  }
}
function initP(){
  grantInfernoIfColosseum(null, loadout.p1);
  grantInfernoIfColosseum(null, loadout.p2);
  p1=mkCroc(160,1,'Gator Gary','gary');
  p1.power1=loadout.p1.power1;
  p1.power2=loadout.p1.power2;
  p1.power3=loadout.p1.power3;
  p1.power4=loadout.p1.power4;
  p1.skin=loadout.p1.skin;
  p2=mkCroc(AW-160-CW,-1,'Croc Carl','carl');
  p2.power1=loadout.p2.power1;
  p2.power2=loadout.p2.power2;
  p2.power3=loadout.p2.power3;
  p2.power4=loadout.p2.power4;
  p2.skin=loadout.p2.skin;
}
function resetRound(){
  resetC(p1,160);resetC(p2,AW-160-CW);
  // Reapply loadout
  p1.power1=loadout.p1.power1;p1.power2=loadout.p1.power2;p1.power3=loadout.p1.power3;p1.power4=loadout.p1.power4;p1.skin=loadout.p1.skin;
  p2.power1=loadout.p2.power1;p2.power2=loadout.p2.power2;p2.power3=loadout.p2.power3;p2.power4=loadout.p2.power4;p2.skin=loadout.p2.skin;
  roundTimer=ROUND_TIME;
  parts.length=0;floats.length=0;projectiles.length=0;
  mysteryBox=null;
  trauma=0;hsTimer=0;smTimer=0;slamTm=0;flashT=0;vigT=0;chromAb=0;bloomInt=0;
  if(!matchIntroPlaying) hideVideo();
}
function startGame(ai){
  isAI=ai;initP();roundNum=1;
  matchStats={p1h:0,p2h:0,p1c:0,p2c:0,p1p:0,p2p:0,rds:0};
  // Roll mutator (20% chance per match)
  if(Math.random() < 0.2){ activeMutator = rollMutator(); if(activeMutator.id!=='normal') slam(activeMutator.icon+' '+activeMutator.name+': '+activeMutator.desc,'#a78bfa',2); }
  else activeMutator = MUTATORS[0];
  // Online: use single-player touch (you control one croc)
  if(isOnline) showTouchControls(false);
  else showTouchControls(!ai); // 2P touch for PvP, single touch for AI
  showKeyLegend();
  playMatchIntro(() => startCD());
}

// ─── MATCH INTRO VIDEO WITH CROSSFADE TO GAMEPLAY ───
let matchIntroPlaying = false;
let matchIntroTimer = null;
let matchIntroCleanup = null;
function playMatchIntro(onDone){
  const src = 'video/match-intro.mp4';
  if(!videoEl || !videoElB){ onDone(); return; }
  matchIntroPlaying = true;
  muteCrowd(); // silence crowd during intro video
  // Clear any previous timers
  if(matchIntroTimer) clearTimeout(matchIntroTimer);
  if(matchIntroCleanup) clearTimeout(matchIntroCleanup);
  // Synchronously kill any pending hideVideo timeout so it can't fire later
  if(videoTimeout){ clearTimeout(videoTimeout); videoTimeout = null; }
  // Stop both video elements immediately (clean slate)
  [videoEl, videoElB].forEach(v => { v.pause(); v.style.display='none'; v.style.opacity='0'; v.removeAttribute('src'); v.load(); });
  videoPlaying = false; videoLocked = false;
  // Hide all screens, show HUD behind video so it's ready
  $('title-screen').classList.add('hidden');
  $('loadout-screen').classList.add('hidden');
  $('result-screen').classList.add('hidden');
  $('online-lobby').classList.add('hidden');
  // Prepare the game canvas behind the video (draw arena first frame)
  resetRound(); state = 'intro';
  $('hud').classList.remove('hidden');
  // Use the incoming video slot for the intro
  const incoming = (activeVidSlot === 'A') ? videoElB : videoEl;
  const outgoing = (activeVidSlot === 'A') ? videoEl : videoElB;
  // Kill any outgoing video
  outgoing.pause(); outgoing.style.display = 'none';
  videoLocked = true; videoPlaying = true;
  incoming.playsInline = true;
  incoming.classList.remove('intro-fade');
  incoming.style.display = 'block';
  incoming.style.opacity = '1';
  incoming.style.pointerEvents = 'none';
  // Use blob cache for instant playback + try unmuted for audio
  const blobSrc = getVideoBlob(src);
  incoming.src = blobSrc;
  incoming.setAttribute('data-orig-src', src);
  incoming.currentTime = 0;
  // Try unmuted first for audio, fall back to muted
  incoming.muted = false; incoming.volume = 1;
  const pp = incoming.play();
  if(pp) pp.catch(() => {
    // Autoplay blocked with audio — retry muted
    incoming.muted = true; incoming.volume = 0;
    const pp2 = incoming.play();
    if(pp2) pp2.catch(() => { matchIntroPlaying=false; onDone(); });
  });
  activeVidSlot = (activeVidSlot === 'A') ? 'B' : 'A';
  if(videoTimeout) clearTimeout(videoTimeout);

  // Let the intro play ALL the way through — crossfade after natural end
  function introCleanup(){
    if(!matchIntroPlaying) return; // already cleaned up
    incoming.classList.add('intro-fade'); // switch to slow 1.5s dissolve
    void incoming.offsetWidth;
    incoming.style.opacity = '0';
    // After dissolve completes, remove video and start gameplay
    matchIntroCleanup = setTimeout(() => {
      incoming.pause();
      incoming.classList.remove('intro-fade');
      incoming.style.display = 'none';
      incoming.style.opacity = '0';
      incoming.removeAttribute('src');
      incoming.load();
      videoPlaying = false; videoLocked = false;
      matchIntroPlaying = false;
      matchIntroTimer = null; matchIntroCleanup = null;
      unmuteCrowd();
      onDone();
    }, 1800); // wait for 1.5s CSS dissolve + buffer
  }

  // When the video ends naturally, crossfade out
  const onEnd = () => {
    incoming.removeEventListener('ended', onEnd);
    introCleanup();
  };
  incoming.addEventListener('ended', onEnd);

  // Safety fallback: if video duration is known, schedule cleanup after full duration + buffer
  // (handles edge case where 'ended' event doesn't fire)
  const checkDur = () => {
    const dur = incoming.duration;
    if(dur && isFinite(dur) && dur > 0){
      matchIntroTimer = setTimeout(() => {
        incoming.removeEventListener('ended', onEnd);
        introCleanup();
      }, dur * 1000 + 500); // full duration + 500ms buffer
    } else {
      // Duration not ready yet, check again
      setTimeout(checkDur, 200);
    }
  };
  setTimeout(checkDur, 100);
}
function startCD(){
  resetRound();state='countdown';cdTimer=2.2;
  slam(`Round ${roundNum}`,'#ffd740',1.5);sfxRound();
  $('hud').classList.remove('hidden');
  $('title-screen').classList.add('hidden');
  $('result-screen').classList.add('hidden');
  $('loadout-screen').classList.add('hidden');
  $('online-lobby').classList.add('hidden');
  updatePowerHUD();
  // Play fight narration
  setTimeout(()=>playNarr(narrFight),800);
}
function startPlay(){state='playing';slam(pick(ROUND_INTROS),'#fff',1)}
function endRound(w){
  state='roundEnd';matchStats.rds++;
  matchStats.p1h+=p1.hits;matchStats.p2h+=p2.hits;
  matchStats.p1c=Math.max(matchStats.p1c,p1.maxCombo);matchStats.p2c=Math.max(matchStats.p2c,p2.maxCombo);
  matchStats.p1p+=p1.parryCount;matchStats.p2p+=p2.parryCount;
  if(w){
    w.wins++;
    if(w.hp>=MAX_HP){
      const pLine=pick(PERFECT_LINES);
      slam(pLine,'#ffd740',2);sfxPerfect();goldenRain(AW/2,AH*.25);bloomInt=1;
      hostSendEvent({type:'sfx',name:'perfect'});
      hostSendEvent({type:'slam',text:pLine,color:'#ffd740',dur:2});
    } else {
      const koLine=pick(KO_LINES);
      slam(koLine,'#ff3d00',1.8);
      hostSendEvent({type:'slam',text:koLine,color:'#ff3d00',dur:1.8});
    }
  } else {
    slam("TIME'S UP!!",'#fbbf24',1.5);
    hostSendEvent({type:'slam',text:"TIME'S UP!!",'color':'#fbbf24',dur:1.5});
  }
  const isMatchWin = w && (w.wins >= ROUNDS_TO_WIN);
  // Play KO video at end of round — but skip if this is the final match-winning round
  // (the boss KO video in endMatch() handles that instead)
  if(w && !isMatchWin){
    const koVid = getKOVideo(w);
    hideVideo();
    playSpecialVideo(koVid, 12000, true);
    // Broadcast video to guest
    hostSendEvent({type:'video', src:koVid, dur:12000, locked:true});
  }
  // Wait for video to fully finish before advancing
  // Use a polling check instead of fixed timeout so we never cut a video short
  function advanceAfterVideo(){
    if(videoPlaying){
      // Video still playing — check again in 500ms
      setTimeout(advanceAfterVideo, 500);
      return;
    }
    hideVideo();
    hostSendEvent({type:'hideVideo'});
    if(isMatchWin) endMatch();
    else {
      roundNum++;
      startCD();
      hostSendEvent({type:'roundStart', cd:2.2, rn:roundNum});
      hostSendEvent({type:'sfx', name:'round'});
      hostSendEvent({type:'slam', text:'Round '+roundNum, color:'#ffd740', dur:1.5});
    }
  }
  // Start checking after minimum delay (2.5s for match win without video, or after video starts)
  const minDelay = (w && !isMatchWin) ? 2000 : 2500;
  setTimeout(advanceAfterVideo, minDelay);
}
// ─── ARENA PROGRESSION: TRANSITION + POWER UPGRADE ───
function showArenaTransition(nextArena, onDone){
  // Create an epic arena unlock transition overlay
  const overlay = document.createElement('div');
  overlay.id = 'arena-transition';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:150;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(5,5,16,.96);opacity:0;transition:opacity .5s;pointer-events:all;';
  overlay.innerHTML = `
    <div style="text-align:center;transform:scale(0.8);transition:transform .6s cubic-bezier(.16,1,.3,1);">
      <div style="font-family:var(--fh);font-size:clamp(1rem,3vw,1.4rem);color:#ffd740;letter-spacing:.2em;text-transform:uppercase;margin-bottom:12px">ARENA UNLOCKED</div>
      <div style="font-family:var(--fh);font-size:clamp(2rem,8vw,4rem);color:#fff;letter-spacing:.08em;line-height:1;text-shadow:0 0 40px rgba(255,215,64,.5),0 4px 0 rgba(0,0,0,.6);">${nextArena.name.toUpperCase()}</div>
      <div style="margin-top:24px;font-family:var(--fh);font-size:clamp(1rem,3vw,1.6rem);color:#4ade80;letter-spacing:.15em;">⚡ POWER UPGRADE ⚡</div>
      <div style="margin-top:8px;font-size:clamp(.85rem,2.5vw,1.1rem);color:rgba(255,255,255,.7);letter-spacing:.08em;">Choose 2 more powers for your arsenal</div>
      <div style="margin-top:32px;display:flex;gap:16px;justify-content:center;flex-wrap:wrap" id="arena-trans-stars">
        <span style="font-size:2.5rem;animation:pipPop .5s ease .2s both">⭐</span>
        <span style="font-size:2.5rem;animation:pipPop .5s ease .4s both">⭐</span>
        <span style="font-size:2.5rem;animation:pipPop .5s ease .6s both">⭐</span>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  // Animate in
  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
    overlay.querySelector('div').style.transform = 'scale(1)';
  });
  // Auto-dismiss after 3.5s → show power upgrade loadout
  setTimeout(() => {
    overlay.style.opacity = '0';
    setTimeout(() => {
      overlay.remove();
      onDone();
    }, 500);
  }, 3500);
}

function showPowerUpgradeScreen(player, existingPowers, onDone){
  // Show a power selection screen for picking 2 MORE powers (not duplicates)
  const ls = $('loadout-screen');
  if(!ls) { onDone(); return; }
  const upgradeSel = {power3:null, power4:null};
  const playerLabel = player==='p1' ? '🐊 GATOR GARY' : '🐊 CROC CARL';
  const playerColor = player==='p1' ? '#4ade80' : '#f472b6';

  function renderUpgrade(){
    ls.innerHTML = `
      <div class="lo-bg"></div>
      <div class="lo-content glass">
        <div class="lo-title" style="color:${playerColor}">⚡ ${playerLabel} POWER UP ⚡</div>
        <div class="lo-subtitle">Choose 2 NEW Powers</div>
        <div style="font-size:12px;color:rgba(255,255,255,.5);letter-spacing:.06em;margin-bottom:8px">Current: ${existingPowers.map(p=>POWERS[p]?POWERS[p].icon+' '+POWERS[p].name:'').filter(Boolean).join(' • ')}</div>
        <div class="lo-powers" id="lo-powers">
          ${POWER_KEYS.filter(k => !existingPowers.includes(k)).map(k=>{
            const def = POWERS[k];
            const isSelected = upgradeSel.power3===k||upgradeSel.power4===k;
            return `<div class="lo-power-card ${isSelected?'selected':''}" data-power="${k}">
              <span class="lo-power-icon">${def.icon}</span>
              <span class="lo-power-name">${def.name}</span>
              <span class="lo-power-desc">${def.desc}</span>
              <span class="lo-power-cd">${def.cd}s CD</span>
            </div>`;
          }).join('')}
        </div>
        <div class="lo-hint" id="lo-hint">${upgradeSel.power3&&upgradeSel.power4?'Ready!':'Select 2 new powers'}</div>
        <button class="btn btn-primary lo-fight-btn" id="lo-fight" ${upgradeSel.power3&&upgradeSel.power4?'':'disabled'}>
          ⚔️ CONTINUE FIGHT!
        </button>
      </div>
    `;
    // Wire up power cards
    ls.querySelectorAll('.lo-power-card').forEach(card=>{
      card.addEventListener('click',()=>{
        const k=card.dataset.power;
        if(upgradeSel.power3===k){ upgradeSel.power3=null; }
        else if(upgradeSel.power4===k){ upgradeSel.power4=null; }
        else if(!upgradeSel.power3){ upgradeSel.power3=k; }
        else if(!upgradeSel.power4){ upgradeSel.power4=k; }
        else { upgradeSel.power3=upgradeSel.power4; upgradeSel.power4=k; }
        renderUpgrade();
      });
    });
    // Wire up fight button
    const fBtn = $('lo-fight');
    if(fBtn) fBtn.addEventListener('click',()=>{
      if(!upgradeSel.power3||!upgradeSel.power4) return;
      onDone(upgradeSel.power3, upgradeSel.power4);
    });
  }

  renderUpgrade();
  ls.classList.remove('hidden');
}

function triggerArenaProgression(winner){
  // Find next arena in sequence
  const arenaOrder = ['boardwalk','swamp','rooftop','colosseum'];
  const curIdx = arenaOrder.indexOf(currentArena.id);
  const nextIdx = curIdx + 1;

  if(nextIdx >= arenaOrder.length){
    // Beat all arenas! Show final victory
    endMatchFinal(winner);
    return;
  }

  const nextArena = ARENAS.find(a => a.id === arenaOrder[nextIdx]);
  if(!nextArena){ endMatchFinal(winner); return; }

  // Play KO video first
  const koVid = getKOVideo(winner);
  playSpecialVideo(koVid, 12000, true);
  hostSendEvent({type:'video', src:koVid, dur:12000, locked:true});

  // Wait for video to finish, then show transition
  function afterVideo(){
    if(videoPlaying){ setTimeout(afterVideo, 500); return; }
    hideVideo();

    // Unlock the next arena
    if(!unlockedArenas.includes(nextArena.id)) unlockedArenas.push(nextArena.id);
    currentArena = nextArena;
    arenaProgressionIdx = nextIdx;

    // Show arena transition
    showArenaTransition(nextArena, () => {
      // Show power upgrade screen (P1 only in AI mode)
      const p1existing = [loadout.p1.power1, loadout.p1.power2].filter(Boolean);
      if(loadout.p1.power3) p1existing.push(loadout.p1.power3);
      if(loadout.p1.power4) p1existing.push(loadout.p1.power4);

      showPowerUpgradeScreen('p1', p1existing, (pw3, pw4) => {
        loadout.p1.power3 = pw3;
        loadout.p1.power4 = pw4;

        // AI gets random new powers too
        if(isAI){
          const aiAvail = POWER_KEYS.filter(k => k !== loadout.p2.power1 && k !== loadout.p2.power2);
          loadout.p2.power3 = aiAvail[Math.floor(Math.random()*aiAvail.length)];
          const aiAvail2 = aiAvail.filter(k => k !== loadout.p2.power3);
          loadout.p2.power4 = aiAvail2[Math.floor(Math.random()*aiAvail2.length)];
        }

        // Hide loadout, reset for new arena match
        $('loadout-screen').classList.add('hidden');
        $('result-screen').classList.add('hidden');

        // Reset crocs + apply all 4 powers
        initP();
        roundNum = 1;
        matchStats = {p1h:0,p2h:0,p1c:0,p2c:0,p1p:0,p2p:0,rds:0};
        updatePowerHUD();
        if(isOnline) showTouchControls(false);
        else showTouchControls(!isAI);
        showKeyLegend();
        playMatchIntro(() => startCD());
      });
    });
  }
  setTimeout(afterVideo, 2000);
}

// Original endMatch becomes endMatchFinal (called when all arenas beaten or for online)
function endMatchFinal(winner){
  // This is the actual final result screen
  const w = winner || (p1.wins>=ROUNDS_TO_WIN?p1:p2);
  endMatchInner(w);
}

function endMatch(){
  state='result';
  const w=p1.wins>=ROUNDS_TO_WIN?p1:p2;

  // Check if we should progress to next arena (single player only)
  if(isAI && w === p1){
    // Player won! Check if there's a next arena
    const arenaOrder = ['boardwalk','swamp','rooftop','colosseum'];
    const curIdx = arenaOrder.indexOf(currentArena.id);
    if(curIdx < arenaOrder.length - 1){
      // Trigger arena progression instead of ending
      triggerArenaProgression(w);
      return;
    }
  }

  endMatchInner(w);
}

function endMatchInner(w){
  state='result';
  const l=w===p1?p2:p1;
  const wc=w===p1?'var(--p1)':'var(--p2)';
  // Victory finisher text
  const finisher = w.charKey==='gary' ? pick(FINISHERS_GARY) : pick(FINISHERS_CARL);
  $('res-winner').textContent=`🐊 ${w.name} ${pick(WIN_LINES)}`;
  $('res-winner').style.color=wc;
  $('res-score').textContent=`${p1.wins} — ${p2.wins}`;

  // Ranked tier + daily challenge row
  const tier = getPlayerTier();
  const dailyStr = dailyChallenge && !dailyChallengeComplete ? `<div style="grid-column:span 2;padding-top:8px;border-top:1px solid rgba(255,255,255,.06)"><div class="v" style="font-size:14px">${dailyChallenge.icon} ${dailyChallenge.desc}</div><div class="l">DAILY CHALLENGE</div></div>` : (dailyChallengeComplete ? '<div style="grid-column:span 2"><div class="v" style="color:#4ade80">✅ DAILY COMPLETE!</div></div>' : '');

  $('res-grid').innerHTML=`<div><div class="v">${matchStats.p1h}</div><div class="l">Gary Hits</div></div><div><div class="v">${matchStats.p2h}</div><div class="l">Carl Hits</div></div><div><div class="v">${matchStats.p1c}</div><div class="l">Gary Best Combo</div></div><div><div class="v">${matchStats.p2c}</div><div class="l">Carl Best Combo</div></div><div><div class="v">${matchStats.p1p}</div><div class="l">Gary Parries</div></div><div><div class="v">${matchStats.p2p}</div><div class="l">Carl Parries</div></div><div style="grid-column:span 2;border-top:1px solid rgba(255,255,255,.08);padding-top:8px;margin-top:4px"><div class="v" style="font-size:15px">${tier.icon} ${tier.name}</div><div class="l">RANK — ${playerElo} ELO</div></div>${dailyStr}`;

  // Play alternating winner cinematic finishing video (locked = unskippable)
  // Colosseum: play epic trophy celebration video instead of standard KO
  const isColosseum = currentArena.id === 'colosseum';
  const matchKOVid = isColosseum ? 'video/colosseum-trophy.mp4' : getKOVideo(w);
  playSpecialVideo(matchKOVid, isColosseum ? 12000 : 10500, true);
  // Broadcast to guest: video + result screen
  hostSendEvent({type:'video', src:matchKOVid, dur:10500, locked:true});
  hostSendEvent({type:'matchEnd', resultHTML:true,
    winner: '\u{1F40A} '+w.name+' '+pick(WIN_LINES), winColor: wc,
    score: p1.wins+' \u2014 '+p2.wins,
    gridHTML: $('res-grid').innerHTML,
    delay: 11500
  });
  // Wait for the KO video to ACTUALLY finish before showing result screen
  // Poll videoPlaying instead of hardcoded timeout so we never cut off a video
  function showResultAfterVideo(){
    if(videoPlaying){
      setTimeout(showResultAfterVideo, 500);
      return;
    }
    slam(finisher, wc, 2);
    hostSendEvent({type:'slam', text:finisher, color:wc, dur:2});
    setTimeout(() => { $('result-screen').classList.remove('hidden'); }, 500);
  }
  // Start polling after a minimum 2s delay (video needs time to start)
  setTimeout(showResultAfterVideo, 2000);

  // Win tracking + ELO + Battle Pass + Streak rewards
  const winner = isAI ? (w===p1?'p1':'ai') : (w===p1?'p1':'p2');
  const won = winner==='p1'||(!isAI&&winner==='p2');
  const eloDelta = eloChange(won);
  addMatchResult(won, eloDelta, currentArena.id);
  if(won){
    const {wins,streak} = addWin();
    // Battle pass XP: 50 base + 20 per round won + 30 for perfect
    let xpGain = 50 + w.wins * 20;
    if(w.hp >= MAX_HP) xpGain += 30;
    const tiersGained = addBPXP(xpGain);
    // Arena unlocks from streaks
    if(streak >= 3 && !unlockedArenas.includes('swamp')) unlockedArenas.push('swamp');
    if(streak >= 7 && !unlockedArenas.includes('rooftop')) unlockedArenas.push('rooftop');
    if(streak >= 10 && !unlockedArenas.includes('colosseum')) unlockedArenas.push('colosseum');
    // Streak reward notification
    const sr = STREAK_REWARDS.find(s => s.streak === streak);
    if(sr) setTimeout(()=> slam(sr.icon + ' ' + sr.reward, '#ffd740', 2.5), 13000);
    // Perfect round daily challenge
    if(w.hp >= MAX_HP) _dailyPerfect = true;
    // Check daily challenge completion
    if(dailyChallenge && !dailyChallengeComplete && dailyChallenge.check()){
      dailyChallengeComplete = true;
      addBPXP(200); // bonus XP for daily
      setTimeout(()=> slam('✅ DAILY CHALLENGE COMPLETE! +200 XP', '#4ade80', 2.5), 14000);
    }
    $('res-streak').innerHTML=`🔥 ${streak} WIN STREAK  |  ${wins} TOTAL WINS<br><span style="font-size:13px;color:#4ade80">+${eloDelta} ELO  |  +${xpGain} XP  |  TIER ${bpTier}/10</span>`;
    $('res-streak').style.display='block';
  } else {
    resetStreak();
    $('res-streak').innerHTML=`<span style="color:#f87171">${eloDelta} ELO</span>  |  ${getTotalWins()} TOTAL WINS`;
    $('res-streak').style.display='block';
  }
  updateLeaderboardEntry();
  captureKOClip(w, l);
  updateTitleStreak();
}

// ─── POWER HUD UPDATE ───
function updatePowerHUD(){
  // Update touch power button labels — single-player controls
  const p1p1btn = document.getElementById('touch-power1');
  const p1p2btn = document.getElementById('touch-power2');
  if(p1p1btn&&p1){ const def=POWERS[p1.power1]; if(def){ p1p1btn.querySelector('.icon').textContent=def.icon; p1p1btn.querySelector('.plabel').textContent=def.name.split(' ')[0]; } }
  if(p1p2btn&&p1){ const def=POWERS[p1.power2]; if(def){ p1p2btn.querySelector('.icon').textContent=def.icon; p1p2btn.querySelector('.plabel').textContent=def.name.split(' ')[0]; } }
  // Power 3/4 touch buttons
  const p1p3btn = document.getElementById('touch-power3');
  const p1p4btn = document.getElementById('touch-power4');
  if(p1p3btn){ if(p1&&p1.power3){ const def=POWERS[p1.power3]; if(def){ p1p3btn.querySelector('.icon').textContent=def.icon; p1p3btn.querySelector('.plabel').textContent=def.name.split(' ')[0]; } p1p3btn.style.display=''; } else { p1p3btn.style.display='none'; } }
  if(p1p4btn){ if(p1&&p1.power4){ const def=POWERS[p1.power4]; if(def){ p1p4btn.querySelector('.icon').textContent=def.icon; p1p4btn.querySelector('.plabel').textContent=def.name.split(' ')[0]; } p1p4btn.style.display=''; } else { p1p4btn.style.display='none'; } }
  // Update 2P touch power button labels
  const tp1p1 = document.getElementById('tp1-pow1');
  const tp1p2 = document.getElementById('tp1-pow2');
  const tp2p1 = document.getElementById('tp2-pow1');
  const tp2p2 = document.getElementById('tp2-pow2');
  if(tp1p1&&p1){ const d=POWERS[p1.power1]; if(d){ tp1p1.querySelector('.icon').textContent=d.icon; tp1p1.querySelector('.plabel').textContent=d.name.split(' ')[0]; } }
  if(tp1p2&&p1){ const d=POWERS[p1.power2]; if(d){ tp1p2.querySelector('.icon').textContent=d.icon; tp1p2.querySelector('.plabel').textContent=d.name.split(' ')[0]; } }
  if(tp2p1&&p2){ const d=POWERS[p2.power1]; if(d){ tp2p1.querySelector('.icon').textContent=d.icon; tp2p1.querySelector('.plabel').textContent=d.name.split(' ')[0]; } }
  if(tp2p2&&p2){ const d=POWERS[p2.power2]; if(d){ tp2p2.querySelector('.icon').textContent=d.icon; tp2p2.querySelector('.plabel').textContent=d.name.split(' ')[0]; } }
}

// ─── HUD (optimized: only touch DOM when values change) ───
let _hudCache = {};
function hudSet(id, prop, val){
  const key = id + '.' + prop;
  if(_hudCache[key] === val) return;
  _hudCache[key] = val;
  const el = $(id);
  if(!el) return;
  if(prop === 'textContent') el.textContent = val;
  else if(prop === 'innerHTML') el.innerHTML = val;
  else if(prop === 'className') el.className = val;
}
function updateHUD(){
  function pipHTML(hp,max,cls){let s='';for(let i=0;i<max;i++){s+=`<span class="pip ${cls} ${i<hp?'full':'empty'}"></span>`}return s}
  hudSet('p1pips','innerHTML',pipHTML(p1.hp,MAX_HP,'p1pip'));
  hudSet('p2pips','innerHTML',pipHTML(p2.hp,MAX_HP,'p2pip'));
  hudSet('p1s','textContent',`Wins ${p1.wins}`);hudSet('p2s','textContent',`Wins ${p2.wins}`);
  hudSet('hround','textContent',`ROUND ${roundNum}`);
  const timerVal=Math.ceil(Math.max(0,roundTimer));
  hudSet('htimer','textContent',timerVal);
  hudSet('htimer','className',roundTimer<10?'htimer warn':'htimer');
  hudSet('p1combo','textContent',p1.combo>=3?`${p1.combo} HIT COMBO`:'');
  hudSet('p2combo','textContent',p2.combo>=3?`${p2.combo} HIT COMBO`:'');

  const p1cd=p1.launchCD>0?Math.ceil(p1.launchCD*10)/10:0;
  hudSet('p1launch','textContent',p1cd>0?`🎯 ${p1cd.toFixed(1)}s`:'🎯 READY');
  hudSet('p1launch','className','launch-cd'+(p1cd<=0?' ready':''));
  if(!isAI){
    const p2cd=p2.launchCD>0?Math.ceil(p2.launchCD*10)/10:0;
    hudSet('p2launch','textContent',p2cd>0?`🎯 ${p2cd.toFixed(1)}s`:'🎯 READY');
    hudSet('p2launch','className','launch-cd'+(p2cd<=0?' ready':''));
  } else {
    hudSet('p2launch','textContent','');
  }

  // Rage mode indicator
  if(p1&&p1.hp<=1&&p1.alive) $('p1name')?.classList.add('rage'); else $('p1name')?.classList.remove('rage');
  if(p2&&p2.hp<=1&&p2.alive) $('p2name')?.classList.add('rage'); else $('p2name')?.classList.remove('rage');

  // Power cooldowns in HUD
  const p1def1=POWERS[p1?.power1]; const p1def2=POWERS[p1?.power2];
  hudSet('p1pow1','textContent', p1&&p1def1 ? `${p1def1.icon} ${p1.pow1CD>0?p1.pow1CD.toFixed(1)+'s':'READY'}` : '');
  hudSet('p1pow2','textContent', p1&&p1def2 ? `${p1def2.icon} ${p1.pow2CD>0?p1.pow2CD.toFixed(1)+'s':'READY'}` : '');
  const p1def3=POWERS[p1?.power3]; const p1def4=POWERS[p1?.power4];
  hudSet('p1pow3','textContent', p1&&p1def3 ? `${p1def3.icon} ${p1.pow3CD>0?p1.pow3CD.toFixed(1)+'s':'READY'}` : '');
  hudSet('p1pow4','textContent', p1&&p1def4 ? `${p1def4.icon} ${p1.pow4CD>0?p1.pow4CD.toFixed(1)+'s':'READY'}` : '');
  // Rage cooldown
  const p1rc = p1 ? p1.rageCD : 0;
  hudSet('p1rage','textContent', p1rc>0 ? `💀 ${p1rc.toFixed(1)}s` : '💀 READY');
  hudSet('p1rage','className', 'rage-cd' + (p1rc<=0?' ready':''));
  if(!isAI){
    const p2def1=POWERS[p2?.power1]; const p2def2=POWERS[p2?.power2];
    hudSet('p2pow1','textContent', p2&&p2def1 ? `${p2def1.icon} ${p2.pow1CD>0?p2.pow1CD.toFixed(1)+'s':'READY'}` : '');
    hudSet('p2pow2','textContent', p2&&p2def2 ? `${p2def2.icon} ${p2.pow2CD>0?p2.pow2CD.toFixed(1)+'s':'READY'}` : '');
    const p2rc = p2 ? p2.rageCD : 0;
    hudSet('p2rage','textContent', p2rc>0 ? `💀 ${p2rc.toFixed(1)}s` : '💀 READY');
    hudSet('p2rage','className', 'rage-cd' + (p2rc<=0?' ready':''));
  } else {
    hudSet('p2rage','textContent', '');
  }
}

// ─── INPUT MAPS ───
function getLocalP1(){
  const b = keyBinds.p1;
  return{
    left:keys[b.left]||ts.left,
    right:keys[b.right]||ts.right,
    up:jp[b.up]||ts.up,
    down:jp[b.down]||ts.down,
    attack:jp[b.attack]||ts.attack,
    dash:jp[b.dash]||ts.dash,
    parry:jp[b.parry]||ts.parry,
    launch:jp[b.launch]||ts.launch,
    power1:jp[b.power1]||ts.power1,
    power2:jp[b.power2]||ts.power2,
    power3:jp[b.power3]||ts.power3,
    power4:jp[b.power4]||ts.power4,
    rage:jp[b.rage]||ts.rage,
  };
}
function getLocalP2(){
  const b = keyBinds.p2;
  return{
    left:keys[b.left]||ts2.left,
    right:keys[b.right]||ts2.right,
    up:jp[b.up]||ts2.up,
    down:jp[b.down]||ts2.down,
    attack:jp[b.attack]||ts2.attack,
    dash:jp[b.dash]||ts2.dash,
    parry:jp[b.parry]||ts2.parry,
    launch:jp[b.launch]||ts2.launch,
    power1:jp[b.power1]||ts2.power1,
    power2:jp[b.power2]||ts2.power2,
    power3:jp[b.power3]||ts2.power3,
    power4:jp[b.power4]||ts2.power4,
    rage:jp[b.rage]||ts2.rage,
  };
}
function getP1(){
  // Online guest controls P1 locally (their croc appears as P1)
  if(isOnline && !amHost) return getLocalP1();
  return getLocalP1();
}
function getP2(){
  if(isAI) return getAI(p2,p1);
  // Online host: P2 is remote opponent
  if(isOnline && amHost) return remoteInput;
  // Online guest: they don't run sim, but won't reach here
  return getLocalP2();
}

// ─── POST-PROCESSING ───
// Pre-cache static vignette gradient (created once, reused every frame)
let _vignetteGrad = null;
function getVignetteGrad(){
  if(!_vignetteGrad){ _vignetteGrad=ctx.createRadialGradient(AW/2,AH/2,AW*.3,AW/2,AH/2,AW*.7); _vignetteGrad.addColorStop(0,'transparent'); _vignetteGrad.addColorStop(1,'rgba(0,0,0,.28)'); }
  return _vignetteGrad;
}
function postFX(dt){
  bloomInt=Math.max(0,bloomInt-dt*1.5);
  // Bloom — skip blur filter on mobile (extremely expensive)
  if(bloomInt>0 && !PERF_LOW){ctx.save();ctx.globalAlpha=bloomInt*.1;ctx.fillStyle='#ffd740';ctx.filter='blur(32px)';ctx.fillRect(0,0,AW,AH);ctx.filter='none';ctx.restore()}
  // Hit flash (cheap, keep on all devices)
  if(flashT>0){ctx.fillStyle=flashC;ctx.globalAlpha=clamp(flashT/.08,0,1)*.45;ctx.fillRect(0,0,AW,AH);ctx.globalAlpha=1}
  // Dynamic vignette on hit — skip on mobile
  if(vigT>0 && !PERF_LOW){const va=clamp(vigT/.3,0,1)*.4;const vg=ctx.createRadialGradient(AW/2,AH/2,AW*.25,AW/2,AH/2,AW*.65);vg.addColorStop(0,'transparent');vg.addColorStop(1,vigC);ctx.globalAlpha=va;ctx.fillStyle=vg;ctx.fillRect(0,0,AW,AH);ctx.globalAlpha=1}
  // Static vignette — use cached gradient
  if(!PERF_LOW){ctx.fillStyle=getVignetteGrad();ctx.fillRect(0,0,AW,AH);}
  // Chromatic aberration — skip on mobile
  chromAb=Math.max(0,chromAb-dt*2);
  if(chromAb>.01 && !PERF_LOW){ctx.save();ctx.globalAlpha=chromAb*.25;ctx.globalCompositeOperation='screen';ctx.fillStyle='rgba(255,0,0,.1)';ctx.fillRect(chromAb*3,0,AW,AH);ctx.fillStyle='rgba(0,0,255,.1)';ctx.fillRect(-chromAb*3,0,AW,AH);ctx.globalCompositeOperation='source-over';ctx.restore()}
  // Slow-mo bars (cheap, keep)
  if(smTimer>0){const barH=24*clamp(smTimer/SLO_DUR,0,1);ctx.fillStyle='rgba(0,0,0,.6)';ctx.fillRect(0,0,AW,barH);ctx.fillRect(0,AH-barH,AW,barH)}
  // Film grain — COMPLETELY DISABLED on mobile (20 random rects per frame is wasteful)
  if(!PERF_LOW){
    ctx.save();ctx.globalAlpha=.015;
    for(let i=0;i<20;i++){ctx.fillStyle=Math.random()>.5?'#fff':'#000';ctx.fillRect(rand(0,AW),rand(0,AH),rand(1,3),rand(1,3))}
    ctx.restore();
  }
}

// ─── TITLE STREAK ───
function updateTitleStreak(){
  const el=$('title-streak');
  if(!el)return;
  const streak=getStreak();
  const wins=getTotalWins();
  if(streak>0){el.textContent=`🔥 ${streak} WIN STREAK`; el.style.display='block';}
  else{el.textContent='';el.style.display='none';}
  const twEl=$('title-totalwins');
  if(twEl){
    const tier = getPlayerTier();
    const rank = getPlayerRank();
    const rankStr = rank > 0 && leaderboard.length > 1 ? ` • Rank #${rank}` : '';
    if(wins > 0 || playerElo > 0){
      twEl.innerHTML = `${tier.icon} ${tier.name} — ${playerElo} ELO${rankStr}<br><span style="font-size:11px;color:var(--mut)">${wins}W / ${_memLosses}L • Best Streak: ${_bestStreak}</span>`;
    } else {
      twEl.textContent = '';
    }
  }
  // Also update player name display on title
  const pnEl = $('title-playername');
  if(pnEl && playerName) pnEl.textContent = '\u{1F464} ' + playerName;
}

// ─── LOADOUT SCREEN ───
let loadoutPhase = 'p1'; // 'p1' | 'p2' | 'done'
let loadoutSelections = {
  p1:{power1:null,power2:null,power3:null,power4:null,skin:'default'},
  p2:{power1:null,power2:null,power3:null,power4:null,skin:'default'},
};

function buildLoadoutScreen(){
  const totalWins = getTotalWins();
  const ls = $('loadout-screen');
  if(!ls) return;

  loadoutPhase = 'p1';
  loadoutSelections = {
    p1:{power1:null,power2:null,skin:'default'},
    p2:{power1:null,power2:null,skin:'default'},
  };

  renderLoadoutPhase(totalWins);
  ls.classList.remove('hidden');
  $('title-screen').classList.add('hidden');
}

function renderLoadoutPhase(totalWins){
  const ls = $('loadout-screen');
  const player = loadoutPhase;
  const isBoth = !pendingIsAI; // 2P mode shows both

  const playerLabel = player==='p1' ? '🐊 GATOR GARY (P1)' : '🐊 CROC CARL (P2)';
  const playerColor = player==='p1' ? '#4ade80' : '#f472b6';

  ls.innerHTML = `
    <div class="lo-bg"></div>
    <div class="lo-content glass">
      <div class="lo-title" style="color:${playerColor}">${playerLabel}</div>
      <div class="lo-subtitle">Choose 2 Powers</div>

      <div class="lo-section-label">SPECIAL POWERS</div>
      <div class="lo-powers" id="lo-powers">
        ${POWER_KEYS.map(k=>{
          const def=POWERS[k];
          const sel=loadoutSelections[player];
          const isSelected = sel.power1===k||sel.power2===k;
          return `<div class="lo-power-card ${isSelected?'selected':''}" data-power="${k}">
            <span class="lo-power-icon">${def.icon}</span>
            <span class="lo-power-name">${def.name}</span>
            <span class="lo-power-desc">${def.desc}</span>
            <span class="lo-power-cd">${def.cd}s CD</span>
          </div>`;
        }).join('')}
      </div>

      <div class="lo-section-label">SKIN</div>
      <div class="lo-skins" id="lo-skins">
        ${SKIN_DEFS[player==='p1'?'gary':'carl'].map(sk=>{
          const locked = sk.winsReq>0 && totalWins<sk.winsReq;
          const isSel = loadoutSelections[player].skin===sk.id;
          return `<div class="lo-skin-card ${isSel?'selected':''} ${locked?'locked':''}" data-skin="${sk.id}" data-wins="${sk.winsReq}">
            <div class="lo-skin-preview">${locked?'🔒':'👕'}</div>
            <span class="lo-skin-name">${sk.name}</span>
            ${locked?`<span class="lo-skin-lock">${sk.winsReq} wins</span>`:''}
          </div>`;
        }).join('')}
      </div>

      <div class="lo-hint" id="lo-hint">Select 2 powers to continue</div>
      <button class="btn btn-primary lo-fight-btn" id="lo-fight" disabled>
        ${player==='p1'&&!pendingIsAI ? 'NEXT: P2 →' : '⚔️ FIGHT!'}
      </button>
    </div>
  `;

  // Power card click
  ls.querySelectorAll('.lo-power-card').forEach(card=>{
    card.addEventListener('click',()=>{
      const k=card.dataset.power;
      const sel=loadoutSelections[player];
      if(sel.power1===k){ sel.power1=null; }
      else if(sel.power2===k){ sel.power2=null; }
      else if(!sel.power1){ sel.power1=k; }
      else if(!sel.power2){ sel.power2=k; }
      else { // swap oldest
        sel.power1=sel.power2;sel.power2=k;
      }
      renderLoadoutPhase(totalWins);
    });
  });

  // Skin card click
  ls.querySelectorAll('.lo-skin-card:not(.locked)').forEach(card=>{
    card.addEventListener('click',()=>{
      loadoutSelections[player].skin=card.dataset.skin;
      renderLoadoutPhase(totalWins);
    });
  });

  // Fight/Next button
  const fightBtn=$('lo-fight');
  if(fightBtn){
    const sel=loadoutSelections[player];
    const ready=sel.power1&&sel.power2;
    fightBtn.disabled=!ready;
    if(ready) fightBtn.removeAttribute('disabled');

    fightBtn.addEventListener('click',()=>{
      const sel2=loadoutSelections[player];
      if(!sel2.power1||!sel2.power2) return;

      if(player==='p1'&&!pendingIsAI){
        // Move to P2
        loadoutPhase='p2';
        renderLoadoutPhase(totalWins);
      } else {
        // Apply and start
        loadout.p1=loadoutSelections.p1;
        loadout.p2=loadoutSelections.p2;
        // Default power2 for AI
        if(pendingIsAI){
          loadout.p2={power1:POWER_KEYS[0],power2:POWER_KEYS[1],skin:'default'};
        }
        $('loadout-screen').classList.add('hidden');
        startGame(pendingIsAI);
      }
    });
  }
}

// ─── ONLINE MULTIPLAYER SYNC (v3.0 — interpolation, events, projectiles) ───

// ── Guest interpolation ──
// Store previous + target state for smooth lerp between server updates
let guestPrevState = null;  // previous server snapshot
let guestTargState = null;  // latest server snapshot
let guestLerpT = 0;         // 0…1 interpolation progress
const GUEST_LERP_RATE = 16; // how fast to interpolate (higher = snappier)
let guestStateAge = 0;      // time since last state received
const GUEST_STALE_MS = 500; // if no state for this long, snap directly

function lerpVal(a, b, t){ return a + (b - a) * t; }

function lerpCroc(c, prev, targ, t){
  if(!c||!prev||!targ) return;
  // Position: smooth lerp
  c.x = lerpVal(prev.x, targ.x, t);
  c.y = lerpVal(prev.y, targ.y, t);
  c.vx = targ.vx; c.vy = targ.vy;
  // Animation values: lerp for smoothness
  c.atkAnim = lerpVal(prev.atkAnim||0, targ.atkAnim||0, t);
  c.walkCycle = lerpVal(prev.walkCycle||0, targ.walkCycle||0, t);
  c.bodyLean = lerpVal(prev.bodyLean||0, targ.bodyLean||0, t);
  c.hitFlash = lerpVal(prev.hitFlash||0, targ.hitFlash||0, t);
  c.squash = lerpVal(prev.squash||0, targ.squash||0, t);
  c.stretch = lerpVal(prev.stretch||0, targ.stretch||0, t);
  c.launchRot = lerpVal(prev.launchRot||0, targ.launchRot||0, t);
  c.deathRot = lerpVal(prev.deathRot||0, targ.deathRot||0, t);
  // Discrete values: snap to latest
  c.face=targ.face;c.hp=targ.hp;c.alive=targ.alive;c.grounded=targ.grounded;
  c.atk=targ.atk;c.atkT=targ.atkT;c.atkCD=targ.atkCD;
  c.dashing=targ.dashing;c.dashT=targ.dashT;c.dashDir=targ.dashDir;
  c.tornadoAct=targ.tornadoAct;c.tailAct=targ.tailAct;
  c.parrying=targ.parrying;c.parryT=targ.parryT;c.parryOK=targ.parryOK;
  c.launched=targ.launched;
  c.stunned=targ.stunned;c.stunT=targ.stunT;
  c.frozen=targ.frozen;c.frozenT=targ.frozenT;
  c.dizzy=targ.dizzy;c.dizzyT=targ.dizzyT;
  c.combo=targ.combo;c.wins=targ.wins;
  c.dead=targ.dead;
  c.comebackActive=targ.comebackActive;
  c.rageSuperUsed=targ.rageSuperUsed;
  c.rageCD=targ.rageCD;
  c.pow1CD=targ.pow1CD;c.pow2CD=targ.pow2CD;
  c.launchCD=targ.launchCD;
}

function applyCrocSnap(c, s){
  if(!c||!s) return;
  c.x=s.x;c.y=s.y;c.vx=s.vx;c.vy=s.vy;
  c.face=s.face;c.hp=s.hp;c.alive=s.alive;c.grounded=s.grounded;
  c.atk=s.atk;c.atkT=s.atkT;c.atkCD=s.atkCD;
  c.dashing=s.dashing;c.dashT=s.dashT;c.dashDir=s.dashDir;
  c.tornadoAct=s.tornadoAct;c.tailAct=s.tailAct;
  c.parrying=s.parrying;c.parryT=s.parryT;c.parryOK=s.parryOK;
  c.launched=s.launched;c.launchRot=s.launchRot;
  c.stunned=s.stunned;c.stunT=s.stunT;
  c.frozen=s.frozen;c.frozenT=s.frozenT;
  c.dizzy=s.dizzy;c.dizzyT=s.dizzyT;
  c.hitFlash=s.hitFlash;c.squash=s.squash;c.stretch=s.stretch;
  c.combo=s.combo;c.wins=s.wins;
  c.dead=s.dead;c.deathRot=s.deathRot;
  c.comebackActive=s.comebackActive;
  c.rageSuperUsed=s.rageSuperUsed;
  c.rageCD=s.rageCD;
  c.pow1CD=s.pow1CD;c.pow2CD=s.pow2CD;
  c.launchCD=s.launchCD;
  c.atkAnim=s.atkAnim;
  c.walkCycle=s.walkCycle;c.bodyLean=s.bodyLean;
}

function serializeCroc(c){
  return {
    x:Math.round(c.x),y:Math.round(c.y),vx:Math.round(c.vx),vy:Math.round(c.vy),
    face:c.face,hp:c.hp,alive:c.alive,grounded:c.grounded,
    atk:c.atk,atkT:+(c.atkT.toFixed(2)),atkCD:+(c.atkCD.toFixed(2)),
    dashing:c.dashing,dashT:+(c.dashT.toFixed(2)),dashDir:c.dashDir,
    tornadoAct:c.tornadoAct,tailAct:c.tailAct,
    parrying:c.parrying,parryT:+(c.parryT.toFixed(2)),parryOK:c.parryOK,
    launched:c.launched,launchRot:+(c.launchRot.toFixed(2)),
    stunned:c.stunned,stunT:+(c.stunT.toFixed(2)),
    frozen:c.frozen,frozenT:+(c.frozenT.toFixed(2)),
    dizzy:c.dizzy,dizzyT:+(c.dizzyT.toFixed(2)),
    hitFlash:+(c.hitFlash.toFixed(2)),squash:+(c.squash.toFixed(2)),stretch:+(c.stretch.toFixed(2)),
    combo:c.combo,wins:c.wins,
    dead:c.dead,deathRot:+(c.deathRot.toFixed(2)),
    comebackActive:c.comebackActive,
    rageSuperUsed:c.rageSuperUsed,
    rageCD:+(c.rageCD.toFixed(1)),
    pow1CD:+(c.pow1CD.toFixed(1)),pow2CD:+(c.pow2CD.toFixed(1)),
    launchCD:+(c.launchCD.toFixed(1)),
    atkAnim:+(c.atkAnim.toFixed(2)),
    walkCycle:+(c.walkCycle.toFixed(2)),bodyLean:+(c.bodyLean.toFixed(2)),
  };
}

function serializeGameState(){
  return {
    p1:serializeCroc(p1), p2:serializeCroc(p2),
    st:state, rt:+(roundTimer.toFixed(2)), rn:roundNum,
    cd:+(cdTimer.toFixed(2)),
    gt:+(gameTime.toFixed(2)),
    // Projectiles — send compact form
    pj:projectiles.slice(0,20).map(p=>({
      x:Math.round(p.x),y:Math.round(p.y),vx:Math.round(p.vx),vy:Math.round(p.vy),
      tp:p.type,ow:p.owner===p1?1:2,act:p.active,sz:p.size||PILLOW_SIZE
    })),
  };
}

function applyGameState(s){
  if(!s||!p1||!p2) return;
  // Shift previous target into prev, store new target
  guestPrevState = guestTargState || s;
  guestTargState = s;
  guestLerpT = 0;
  guestStateAge = 0;
  // Always snap discrete game state
  state = s.st;
  roundTimer = s.rt;
  roundNum = s.rn;
  cdTimer = s.cd;
  // Apply projectiles from host
  applyProjectilesFromHost(s.pj || []);
  updateHUD();
}

// Guest: lerp crocs each frame for smooth rendering
function guestInterpolate(dt){
  if(!guestTargState||!p1||!p2) return;
  guestStateAge += dt * 1000;
  guestLerpT = Math.min(1, guestLerpT + GUEST_LERP_RATE * dt);
  if(guestStateAge > GUEST_STALE_MS || !guestPrevState){
    // Stale or first state — snap directly
    applyCrocSnap(p1, guestTargState.p1);
    applyCrocSnap(p2, guestTargState.p2);
  } else {
    // Smooth interpolation
    lerpCroc(p1, guestPrevState.p1, guestTargState.p1, guestLerpT);
    lerpCroc(p2, guestPrevState.p2, guestTargState.p2, guestLerpT);
  }
}

// Apply projectiles received from host on guest side
function applyProjectilesFromHost(pjArr){
  // Simple approach: rebuild projectiles array from host data
  // This ensures guest always matches host
  projectiles.length = 0;
  for(const p of pjArr){
    if(!p.act) continue;
    projectiles.push({
      x:p.x, y:p.y, vx:p.vx, vy:p.vy,
      type:p.tp, owner:p.ow===1?p1:p2, active:true,
      size:p.sz||PILLOW_SIZE, rot:0, life:5,
      boomerang:p.tp==='boomerang', returning:false,
      originX:p.x, originY:p.y
    });
  }
}

// ── Host → Guest event broadcasting ──
// The host sends discrete events for videos, effects, and transitions
// so the guest plays them in sync
function hostSendEvent(ev){
  if(!isOnline||!amHost) return;
  if(typeof MP !== 'undefined') MP.sendEvent(ev);
}

// Guest receives and executes events from host
function handleOnlineEvent(ev){
  if(!ev) return;
  switch(ev.type){
    case 'video':
      // Play video on guest
      hideVideo();
      playSpecialVideo(ev.src, ev.dur||10500, !!ev.locked);
      break;
    case 'slam':
      slam(ev.text, ev.color||'#fff', ev.dur||1.5);
      break;
    case 'sfx':
      if(ev.name==='round') sfxRound();
      else if(ev.name==='ko') sfxKO();
      else if(ev.name==='perfect'){ sfxPerfect(); goldenRain(AW/2,AH*.25); bloomInt=1; }
      break;
    case 'roundStart':
      // Guest: start the countdown
      resetRound(); state='countdown'; cdTimer=ev.cd||2.2;
      $('hud').classList.remove('hidden');
      $('title-screen').classList.add('hidden');
      $('result-screen').classList.add('hidden');
      $('loadout-screen').classList.add('hidden');
      $('online-lobby').classList.add('hidden');
      updatePowerHUD();
      break;
    case 'matchEnd':
      // Guest: show result screen
      state='result';
      if(ev.resultHTML){
        $('res-winner').textContent = ev.winner || '';
        $('res-winner').style.color = ev.winColor || '#fff';
        $('res-score').textContent = ev.score || '';
        $('res-grid').innerHTML = ev.gridHTML || '';
        $('res-streak').innerHTML = ev.streakHTML || '';
        $('res-streak').style.display = ev.streakHTML ? 'block' : 'none';
      }
      setTimeout(() => { $('result-screen').classList.remove('hidden'); }, ev.delay || 11500);
      break;
    case 'hideVideo':
      hideVideo();
      break;
    case 'screenFlash':
      screenFlash(ev.color, ev.dur);
      break;
    case 'vignette':
      vignette(ev.color, ev.dur);
      break;
    case 'trauma':
      addTrauma(ev.amount);
      break;
    case 'hitStop':
      hitStop(ev.dur);
      break;
    case 'slowMo':
      slowMo(ev.dur, ev.scale);
      break;
    case 'rematchStart':
      // Opponent wants rematch — restart online loadout
      launchOnlineGame();
      break;
  }
}

// Send local input to host (guest only) — sends EVERY frame so held keys stay alive
let guestInputTimer = 0;
const GUEST_INPUT_INTERVAL = 0.033; // ~30fps
function sendLocalInputToHost(dt){
  if(!isOnline||amHost) return;
  guestInputTimer += dt;
  if(guestInputTimer < GUEST_INPUT_INTERVAL) return;
  guestInputTimer = 0;
  const raw = getLocalP1();
  // Merge buffered one-shot inputs (catches touch taps that resolved between frames)
  const inp = {
    left:  raw.left  ? 1 : 0,
    right: raw.right ? 1 : 0,
    up:     (raw.up     || guestInputBuf.up)     ? 1 : 0,
    down:   (raw.down   || guestInputBuf.down)   ? 1 : 0,
    attack: (raw.attack || guestInputBuf.attack) ? 1 : 0,
    dash:   (raw.dash   || guestInputBuf.dash)   ? 1 : 0,
    parry:  (raw.parry  || guestInputBuf.parry)  ? 1 : 0,
    launch: (raw.launch || guestInputBuf.launch) ? 1 : 0,
    power1: (raw.power1 || guestInputBuf.power1) ? 1 : 0,
    power2: (raw.power2 || guestInputBuf.power2) ? 1 : 0,
    rage:   (raw.rage   || guestInputBuf.rage)   ? 1 : 0,
  };
  // Clear one-shot buffer after reading
  guestInputBuf.up=false;guestInputBuf.down=false;guestInputBuf.attack=false;guestInputBuf.dash=false;
  guestInputBuf.parry=false;guestInputBuf.launch=false;guestInputBuf.power1=false;guestInputBuf.power2=false;guestInputBuf.rage=false;
  if(typeof MP !== 'undefined') MP.sendInput(inp);
}

// Host sends game state to guest (throttled to ~20fps for bandwidth)
let hostBroadcastTimer = 0;
const HOST_BROADCAST_INTERVAL = 0.05; // 50ms = 20fps
function hostBroadcastState(dt){
  if(!isOnline||!amHost) return;
  hostBroadcastTimer += dt;
  if(hostBroadcastTimer < HOST_BROADCAST_INTERVAL) return;
  hostBroadcastTimer = 0;
  if(typeof MP !== 'undefined') MP.sendState(serializeGameState());
}

// ── Connection quality monitor ──
let netPingMs = 0;
let netPingTimer = 0;
let netPingSent = 0;
function updateNetPing(dt){
  if(!isOnline) return;
  netPingTimer += dt;
  if(netPingTimer > 2){
    netPingTimer = 0;
    netPingSent = performance.now();
    if(typeof MP !== 'undefined') MP.sendEvent({type:'ping_req'});
  }
}
function handlePingReply(){
  netPingMs = Math.round(performance.now() - netPingSent);
}

// ─── ONLINE LOBBY CONTROLLER ───
function showOnlineLobby(){
  const el = document.getElementById('online-lobby');
  if(!el) return;
  el.classList.remove('hidden');
  document.getElementById('title-screen').classList.add('hidden');
  document.getElementById('lobby-status').textContent = 'Connecting…';
  document.getElementById('lobby-room-code').style.display = 'none';
  document.getElementById('lobby-actions').style.display = 'flex';
  document.getElementById('lobby-waiting').style.display = 'none';
  document.getElementById('lobby-error').textContent = '';
  document.getElementById('lobby-create').disabled = true;
  document.getElementById('lobby-join').disabled = true;

  // Connect
  if(typeof MP !== 'undefined'){
    MP.onRoomCreated = (code) => {
      document.getElementById('lobby-status').textContent = 'Room created! Share code:';
      document.getElementById('lobby-room-code').textContent = code;
      document.getElementById('lobby-room-code').style.display = 'block';
      document.getElementById('lobby-actions').style.display = 'none';
      document.getElementById('lobby-waiting').style.display = 'block';
    };
    MP.onJoinedRoom = (num, code) => {
      amHost = false;
      document.getElementById('lobby-status').textContent = 'Joined room ' + code + '!';
      document.getElementById('lobby-room-code').textContent = code;
      document.getElementById('lobby-room-code').style.display = 'block';
      document.getElementById('lobby-actions').style.display = 'none';
      document.getElementById('lobby-waiting').style.display = 'block';
      document.getElementById('lobby-waiting').querySelector('div').textContent = 'Connected! Starting game…';
      setTimeout(() => launchOnlineGame(), 1500);
    };
    MP.onOpponentJoined = () => {
      document.getElementById('lobby-waiting').querySelector('div').textContent = 'Opponent joined! Starting…';
      setTimeout(() => launchOnlineGame(), 1000);
    };
    MP.onOpponentLeft = () => {
      if(state==='title') return;
      isOnline=false;
      state='title';
      document.getElementById('title-screen').classList.remove('hidden');
      document.getElementById('hud').classList.add('hidden');
      document.getElementById('result-screen').classList.add('hidden');
      document.getElementById('loadout-screen').classList.add('hidden');
      document.getElementById('online-lobby').classList.add('hidden');
      hideTouchControls();hideKeyLegend();hideVideo();
      slam('OPPONENT LEFT','#f87171',2);
    };
    MP.onStateUpdate = (s) => {
      if(isOnline && !amHost) applyGameState(s);
    };
    MP.onOpponentInput = (inp) => {
      if(isOnline && amHost){
        // Continuous keys: replace (latest state wins)
        remoteInput.left   = !!inp.left;
        remoteInput.right  = !!inp.right;
        // One-shot keys: ACCUMULATE with OR so fast taps aren't lost between frames
        remoteInput.up     = remoteInput.up     || !!inp.up;
        remoteInput.down   = remoteInput.down   || !!inp.down;
        remoteInput.attack = remoteInput.attack || !!inp.attack;
        remoteInput.dash   = remoteInput.dash   || !!inp.dash;
        remoteInput.parry  = remoteInput.parry  || !!inp.parry;
        remoteInput.launch = remoteInput.launch || !!inp.launch;
        remoteInput.power1 = remoteInput.power1 || !!inp.power1;
        remoteInput.power2 = remoteInput.power2 || !!inp.power2;
        remoteInput.rage   = remoteInput.rage   || !!inp.rage;
      }
    };
    MP.onEvent = (ev) => {
      if(!ev) return;
      // Ping system: reply to ping requests
      if(ev.type === 'ping_req'){
        MP.sendEvent({type:'ping_reply'});
        return;
      }
      if(ev.type === 'ping_reply'){
        handlePingReply();
        return;
      }
      // Guest handles game events from host
      if(isOnline) handleOnlineEvent(ev);
    };
    MP.onError = (msg) => {
      document.getElementById('lobby-error').textContent = msg;
    };
    MP.onDisconnect = () => {
      document.getElementById('lobby-status').textContent = 'Disconnected';
      document.getElementById('lobby-create').disabled = true;
      document.getElementById('lobby-join').disabled = true;
    };
    // Connect (or reuse existing connection)
    if(MP.isConnected()){
      document.getElementById('lobby-status').textContent = 'Connected! Create or join a room.';
      document.getElementById('lobby-create').disabled = false;
      document.getElementById('lobby-join').disabled = false;
    } else {
      MP.connect().then((ok) => {
        if(ok){
          document.getElementById('lobby-status').textContent = 'Connected! Create or join a room.';
          document.getElementById('lobby-create').disabled = false;
          document.getElementById('lobby-join').disabled = false;
        } else {
          document.getElementById('lobby-error').textContent = 'Could not connect to server. Check your connection and try again.';
          document.getElementById('lobby-status').textContent = 'Disconnected';
        }
      });
    }
  } else {
    document.getElementById('lobby-error').textContent = 'Multiplayer module not loaded.';
  }
}

function hideOnlineLobby(){
  const el = document.getElementById('online-lobby');
  if(el) el.classList.add('hidden');
}

// ─── ONLINE LOADOUT STATE ───
let onlineLoadoutReady = { local: false, remote: false };
let remoteLoadout = null;

function launchOnlineGame(){
  hideOnlineLobby();
  isOnline = true;
  isAI = false;
  amHost = MP.isHost();
  onlineLoadoutReady = { local: false, remote: false };
  remoteLoadout = null;

  // Listen for opponent's loadout
  MP.onLoadout = (lo, from) => {
    remoteLoadout = lo;
    onlineLoadoutReady.remote = true;
    tryStartOnlineMatch();
  };

  // Show loadout screen for this player's character only
  buildOnlineLoadoutScreen();
}

function buildOnlineLoadoutScreen(){
  const totalWins = getTotalWins();
  const ls = $('loadout-screen');
  if(!ls) return;

  // Host picks P1 (Gary), Guest picks P2 (Carl)
  const mySlot = amHost ? 'p1' : 'p2';
  const playerLabel = amHost ? '\u{1F40A} GATOR GARY (P1)' : '\u{1F40A} CROC CARL (P2)';
  const playerColor = amHost ? '#4ade80' : '#f472b6';
  const charKey = amHost ? 'gary' : 'carl';

  loadoutSelections[mySlot] = {power1:null,power2:null,skin:'default'};

  function renderOnlineLoadout(){
    const sel = loadoutSelections[mySlot];

    // Build power cards HTML
    var powersHtml = '';
    POWER_KEYS.forEach(function(k){
      var def=POWERS[k];
      var isSelected = sel.power1===k||sel.power2===k;
      powersHtml += '<div class="lo-power-card '+(isSelected?'selected':'')+'" data-power="'+k+'">'
        +'<span class="lo-power-icon">'+def.icon+'</span>'
        +'<span class="lo-power-name">'+def.name+'</span>'
        +'<span class="lo-power-desc">'+def.desc+'</span>'
        +'<span class="lo-power-cd">'+def.cd+'s CD</span>'
        +'</div>';
    });

    // Build skin cards HTML
    var skinsHtml = '';
    SKIN_DEFS[charKey].forEach(function(sk){
      var locked = sk.winsReq>0 && totalWins<sk.winsReq;
      var isSel = sel.skin===sk.id;
      skinsHtml += '<div class="lo-skin-card '+(isSel?'selected':'')+' '+(locked?'locked':'')+'" data-skin="'+sk.id+'" data-wins="'+sk.winsReq+'">'
        +'<div class="lo-skin-preview">'+(locked?'\u{1F512}':'\u{1F455}')+'</div>'
        +'<span class="lo-skin-name">'+sk.name+'</span>'
        +(locked?'<span class="lo-skin-lock">'+sk.winsReq+' wins</span>':'')
        +'</div>';
    });

    var hintText = onlineLoadoutReady.local ? 'Waiting for opponent\u2026' : 'Select 2 powers to continue';
    var btnText = onlineLoadoutReady.local ? '\u23f3 WAITING\u2026' : '\u2694\ufe0f READY!';
    var btnDisabled = (sel.power1 && sel.power2 && !onlineLoadoutReady.local) ? '' : 'disabled';

    ls.innerHTML = '<div class="lo-bg"></div>'
      +'<div class="lo-content glass">'
      +'<div class="lo-title" style="color:'+playerColor+'">'+playerLabel+'</div>'
      +'<div class="lo-subtitle">Choose 2 Powers</div>'
      +'<div class="lo-section-label">SPECIAL POWERS</div>'
      +'<div class="lo-powers" id="lo-powers">'+powersHtml+'</div>'
      +'<div class="lo-section-label">SKIN</div>'
      +'<div class="lo-skins" id="lo-skins">'+skinsHtml+'</div>'
      +'<div class="lo-hint" id="lo-hint">'+hintText+'</div>'
      +'<button class="btn btn-primary lo-fight-btn" id="lo-fight" '+btnDisabled+'>'+btnText+'</button>'
      +'</div>';

    // Power card click
    ls.querySelectorAll('.lo-power-card').forEach(function(card){
      card.addEventListener('click',function(){
        if(onlineLoadoutReady.local) return;
        var k=card.dataset.power;
        if(sel.power1===k){ sel.power1=null; }
        else if(sel.power2===k){ sel.power2=null; }
        else if(!sel.power1){ sel.power1=k; }
        else if(!sel.power2){ sel.power2=k; }
        else { sel.power1=sel.power2;sel.power2=k; }
        renderOnlineLoadout();
      });
    });

    // Skin card click
    ls.querySelectorAll('.lo-skin-card:not(.locked)').forEach(function(card){
      card.addEventListener('click',function(){
        if(onlineLoadoutReady.local) return;
        sel.skin=card.dataset.skin;
        renderOnlineLoadout();
      });
    });

    // Ready button
    var fightBtn=$('lo-fight');
    if(fightBtn && !onlineLoadoutReady.local){
      fightBtn.addEventListener('click',function(){
        if(!sel.power1||!sel.power2) return;
        onlineLoadoutReady.local = true;
        MP.sendLoadout({power1:sel.power1, power2:sel.power2, skin:sel.skin});
        renderOnlineLoadout();
        tryStartOnlineMatch();
      });
    }
  }

  renderOnlineLoadout();
  ls.classList.remove('hidden');
  $('title-screen').classList.add('hidden');
}

function tryStartOnlineMatch(){
  if(!onlineLoadoutReady.local || !onlineLoadoutReady.remote) return;
  // Apply loadouts
  const mySlot = amHost ? 'p1' : 'p2';
  const theirSlot = amHost ? 'p2' : 'p1';
  loadout[mySlot] = loadoutSelections[mySlot];
  loadout[theirSlot] = remoteLoadout || {power1:'freeze',power2:'shotgun',skin:'default'};
  $('loadout-screen').classList.add('hidden');
  if(typeof MP !== 'undefined') MP.sendGameStart();
  if(amHost){
    // Host runs the authoritative game simulation
    startGame(false);
    // Broadcast match intro video + first round start to guest
    hostSendEvent({type:'video', src:'video/match-intro.mp4', dur:11000, locked:false});
    // Broadcast first round start after intro delay
    setTimeout(() => {
      hostSendEvent({type:'roundStart', cd:2.2, rn:1});
      hostSendEvent({type:'sfx', name:'round'});
      hostSendEvent({type:'slam', text:'Round 1', color:'#ffd740', dur:1.5});
    }, 6200);
  } else {
    // Guest: initialize crocs + loadouts but don't run simulation
    // Guest relies on state updates from host for positions
    isAI = false;
    initP();
    roundNum = 1;
    matchStats = {p1h:0,p2h:0,p1c:0,p2c:0,p1p:0,p2p:0,rds:0};
    activeMutator = MUTATORS[0];
    isOnline = true;
    if(isOnline) showTouchControls(false);
    showKeyLegend();
    // Play the same intro video locally for instant visual feedback
    playMatchIntro(() => {
      // After intro, guest enters countdown state
      // But actual state is driven by host's broadcasts
      resetRound(); state = 'countdown'; cdTimer = 2.2;
      $('hud').classList.remove('hidden');
      updatePowerHUD();
    });
    // Reset interpolation state
    guestPrevState = null;
    guestTargState = null;
    guestLerpT = 0;
    guestStateAge = 0;
  }
}

// ─── DOM BINDINGS ───
const $ = id => document.getElementById(id);

// Safe clipboard write — skips inside TikTok Mini Game (banned API)
function safeClipWrite(text){
  if(typeof TTMinis !== 'undefined') return Promise.resolve(false); // inside TikTok, skip
  if(typeof navigator.clipboard !== 'undefined' && navigator.clipboard){
    return navigator.clipboard.writeText(text).then(()=>true).catch(()=>false);
  }
  return Promise.resolve(false);
}

$('btn-online').addEventListener('click',()=>{ initAudio(); isOnline=false; showOnlineLobby(); });
// btn-pvp removed from UI
if($('btn-pvp')) $('btn-pvp').addEventListener('click',()=>{ initAudio(); isOnline=false; pendingIsAI=false; buildLoadoutScreen(); });
$('btn-ai').addEventListener('click',()=>{ initAudio(); isOnline=false; pendingIsAI=true; buildLoadoutScreen(); });
$('btn-rematch').addEventListener('click',()=>{
  if(isOnline && typeof MP!=='undefined'){
    // Online rematch: go back to loadout selection
    hostSendEvent({type:'rematchStart'});
    launchOnlineGame();
    $('result-screen').classList.add('hidden');
    return;
  }
  roundNum=1; arenaProgressionIdx=0; currentArena=ARENAS[0]; loadout.p1.power3=null; loadout.p1.power4=null; loadout.p2.power3=null; loadout.p2.power4=null; startGame(isAI);
});
$('btn-menu2').addEventListener('click',()=>{
  state='title';
  if(isOnline && typeof MP!=='undefined') MP.disconnect();
  isOnline=false;
  $('title-screen').classList.remove('hidden');
  $('result-screen').classList.add('hidden');
  $('hud').classList.add('hidden');
  $('loadout-screen').classList.add('hidden');
  $('online-lobby').classList.add('hidden');
  hideTouchControls();
  hideKeyLegend();
  hideVideo();
  updateTitleStreak();
});

// Lobby button handlers
$('lobby-create').addEventListener('click',()=>{
  if(typeof MP!=='undefined'&&MP.isConnected()){
    amHost=true;
    MP.createRoom();
  }
});
$('lobby-join').addEventListener('click',()=>{
  const code=$('lobby-code-input').value.trim().toUpperCase();
  if(code.length===4&&typeof MP!=='undefined'&&MP.isConnected()){
    MP.joinRoom(code);
  } else {
    $('lobby-error').textContent='Enter a 4-character room code.';
  }
});
$('lobby-code-input').addEventListener('keydown',(e)=>{
  if(e.key==='Enter'){
    e.preventDefault();
    $('lobby-join').click();
  }
});
$('lobby-back').addEventListener('click',()=>{
  if(typeof MP!=='undefined') MP.disconnect();
  isOnline=false;
  // Clean room code from URL
  if(window.history.replaceState) window.history.replaceState({}, '', location.pathname);
  $('online-lobby').classList.add('hidden');
  $('title-screen').classList.remove('hidden');
});

// Share invite link — copy link + show it visibly so user can share it
$('lobby-share').addEventListener('click',()=>{
  const code = $('lobby-room-code')?.textContent?.trim();
  if(!code) return;
  const pwaBase = 'https://surfguy1985.github.io/croc-clash-server/';
  const url = pwaBase + '?room=' + code;
  const msg = '\uD83D\uDC0A Join my Croc Clash match! ' + url;
  // TikTok in-app share
  if(typeof TT !== 'undefined' && TT.isInTikTok()){
    TT.shareGame(msg);
    $('lobby-copied').textContent = '\u2705 Shared!';
    setTimeout(()=>{ $('lobby-copied').textContent=''; }, 4000);
    return;
  }
  // Copy link to clipboard first
  const copied = safeClipWrite(url);
  copied.then((ok)=>{
    // Show the link visibly so user can long-press to copy or share manually
    const el = $('lobby-copied');
    if(ok){
      el.innerHTML = '\u2705 Link copied!<br><span style="font-size:11px;color:var(--acc);word-break:break-all;user-select:all">' + url + '</span><br><span style="font-size:10px;color:var(--mut)">Paste in Messages to send to your friend</span>';
    } else {
      el.innerHTML = '\uD83D\uDD17 Send this link to your friend:<br><span style="font-size:11px;color:var(--acc);word-break:break-all;user-select:all">' + url + '</span><br><span style="font-size:10px;color:var(--mut)">Long-press to copy, then paste in Messages</span>';
    }
  });
  // Also try native share sheet (works in Safari, some WebViews)
  if(navigator.share){
    navigator.share({ title:'Croc Clash', text: msg, url }).catch(()=>{});
  }
});

// ─── VIRAL UI CONTROLLERS ───

// Leaderboard screen
function showLeaderboard(){
  initLeaderboard();
  const el = document.getElementById('leaderboard-screen');
  el.classList.remove('hidden'); el.style.display='flex';
  const myRank = getPlayerRank();
  const rankDiff = _prevRank > 0 ? _prevRank - myRank : 0; // positive = climbed
  // Render list
  const list = document.getElementById('lb-list');
  list.innerHTML = leaderboard.slice(0,15).map((e,i) => {
    const tier = RANKED_TIERS.find(t=>t.id===e.tier)||RANKED_TIERS[0];
    const isMe = !e.isBot;
    const bg = isMe ? 'rgba(255,215,64,.12)' : i<3 ? 'rgba(255,215,64,.04)' : 'rgba(255,255,255,.03)';
    const border = isMe ? '1.5px solid rgba(255,215,64,.4)' : '1px solid rgba(255,255,255,.05)';
    const rankNum = i + 1;
    const rankColor = rankNum===1?'#ffd740':rankNum===2?'#c0c0c0':rankNum===3?'#cd7f32':'var(--mut)';
    const medal = rankNum===1?'🥇':rankNum===2?'🥈':rankNum===3?'🥉':'';
    // Streak fire indicator
    const streakStr = e.streak >= 3 ? `<span style="font-size:10px;color:#ff6a00">🔥${e.streak}</span>` : '';
    return `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:10px;background:${bg};border:${border};${isMe?'box-shadow:0 0 12px rgba(255,215,64,.15)':''}">
      <span style="font-family:var(--fh);font-size:15px;color:${rankColor};min-width:30px;text-align:center">${medal||'#'+rankNum}</span>
      <span style="font-size:15px">${tier.icon}</span>
      <span style="flex:1;font-family:var(--fh);font-size:13px;letter-spacing:.06em;${isMe?'color:var(--gold);text-shadow:0 0 8px rgba(255,215,64,.3)':'color:var(--txt)'}">${e.name} ${streakStr}</span>
      <span style="font-family:var(--fh);font-size:12px;color:${isMe?'var(--gold)':'var(--mut)'}">${e.elo}</span>
      <span style="font-family:var(--fd);font-size:10px;color:var(--p1);min-width:24px">${e.wins}W</span>
    </div>`;
  }).join('');
  // Season header with rank
  const rankArrow = rankDiff > 0 ? `<span style="color:#4ade80">▲${rankDiff}</span>` : rankDiff < 0 ? `<span style="color:#f87171">▼${Math.abs(rankDiff)}</span>` : '';
  document.getElementById('lb-season').innerHTML = `${SEASON_NAME} &mdash; Resets Sunday<br><span style="font-size:13px;color:var(--gold)">${getDisplayName()} \u2014 RANK #${myRank} / ${leaderboard.length} ${rankArrow}</span>`;
  // Career stats row
  let careerHTML = `<div style="display:flex;gap:12px;justify-content:center;margin:8px 0 4px;flex-wrap:wrap">`;
  careerHTML += `<div style="text-align:center"><div style="font-family:var(--fh);font-size:16px;color:var(--gold)">${playerElo}</div><div style="font-family:var(--fd);font-size:10px;color:var(--mut)">ELO</div></div>`;
  careerHTML += `<div style="text-align:center"><div style="font-family:var(--fh);font-size:16px;color:var(--p1)">${_memWins}</div><div style="font-family:var(--fd);font-size:10px;color:var(--mut)">WINS</div></div>`;
  careerHTML += `<div style="text-align:center"><div style="font-family:var(--fh);font-size:16px;color:#f87171">${_memLosses}</div><div style="font-family:var(--fd);font-size:10px;color:var(--mut)">LOSSES</div></div>`;
  careerHTML += `<div style="text-align:center"><div style="font-family:var(--fh);font-size:16px;color:#ff6a00">${_bestStreak}</div><div style="font-family:var(--fd);font-size:10px;color:var(--mut)">BEST STREAK</div></div>`;
  careerHTML += `<div style="text-align:center"><div style="font-family:var(--fh);font-size:16px;color:#a78bfa">${Math.max(_peakElo,playerElo)}</div><div style="font-family:var(--fd);font-size:10px;color:var(--mut)">PEAK ELO</div></div>`;
  careerHTML += `</div>`;
  // Match history
  if(_matchHistory.length > 0){
    careerHTML += `<div style="font-family:var(--fh);font-size:11px;letter-spacing:.1em;color:var(--mut);margin:8px 0 4px;text-align:center">RECENT MATCHES</div>`;
    careerHTML += `<div style="display:flex;gap:4px;justify-content:center;flex-wrap:wrap">`;
    _matchHistory.slice(-10).forEach(m => {
      const col = m.won ? '#4ade80' : '#f87171';
      const sign = m.delta > 0 ? '+' : '';
      careerHTML += `<div style="width:28px;height:28px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:11px;font-family:var(--fh);background:${m.won?'rgba(74,222,128,.1)':'rgba(248,113,113,.1)'};border:1px solid ${col}40;color:${col}" title="${sign}${m.delta} ELO">${m.won?'W':'L'}</div>`;
    });
    careerHTML += `</div>`;
  }
  // Insert career stats before battle pass
  const bpProg = document.getElementById('bp-progress');
  // Put career stats in its own container (create or reuse)
  let careerEl = document.getElementById('lb-career');
  if(!careerEl){
    careerEl = document.createElement('div');
    careerEl.id = 'lb-career';
    bpProg.parentElement.insertBefore(careerEl, bpProg);
  }
  careerEl.innerHTML = careerHTML;
  // Battle pass
  bpProg.innerHTML = BP_TIERS.map(t => {
    const done = bpTier >= t.tier;
    return `<div style="width:28px;height:28px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:14px;background:${done?'rgba(255,215,64,.2)':'rgba(255,255,255,.04)'};border:1px solid ${done?'rgba(255,215,64,.4)':'rgba(255,255,255,.06)'}" title="${t.reward}">${done?t.icon:'🔒'}</div>`;
  }).join('');
  const nextTier = BP_TIERS.find(t => t.tier > bpTier);
  document.getElementById('bp-info').textContent = nextTier ? `${bpXP}/${nextTier.xpReq} XP to Tier ${nextTier.tier}: ${nextTier.reward}` : 'MAX TIER REACHED! 👑';
  document.getElementById('bp-daily').textContent = dailyChallenge ? (dailyChallengeComplete ? '✅ Daily Complete!' : `${dailyChallenge.icon} Daily: ${dailyChallenge.desc}`) : '';
}
document.getElementById('lb-close')?.addEventListener('click', () => { const e=document.getElementById('leaderboard-screen'); e.classList.add('hidden'); e.style.display='none'; });
document.getElementById('btn-leaderboard')?.addEventListener('click', showLeaderboard);

// KO Share screen
function showShareScreen(){
  if(!koClipData) return;
  const el = document.getElementById('share-screen');
  el.classList.remove('hidden'); el.style.display='flex';
  // Draw KO clip card on canvas
  const c = document.getElementById('ko-clip-canvas');
  const cx = c.getContext('2d');
  const W=540, H=540;
  // Background
  const bg = cx.createLinearGradient(0,0,0,H);
  bg.addColorStop(0,'#0a0020');bg.addColorStop(0.5,'#1a0a3a');bg.addColorStop(1,'#050510');
  cx.fillStyle=bg;cx.fillRect(0,0,W,H);
  // Title
  cx.font='bold 48px "Bebas Neue",sans-serif';cx.fillStyle='#ffd740';cx.textAlign='center';
  cx.fillText('CROC CLASH',W/2,60);
  cx.font='18px "Bebas Neue",sans-serif';cx.fillStyle='#ff6b35';cx.fillText('K.O. HIGHLIGHT',W/2,88);
  // Winner
  cx.font='bold 42px "Bebas Neue",sans-serif';
  cx.fillStyle=koClipData.winnerChar==='gary'?'#4ade80':'#f472b6';
  cx.fillText('🐊 '+koClipData.winner+' WINS!',W/2,160);
  // Stats
  cx.font='22px "Space Grotesk",sans-serif';cx.fillStyle='#f0f0f5';
  cx.fillText(koClipData.hits+' HITS  |  '+koClipData.combo+' BEST COMBO',W/2,220);
  cx.fillText(koClipData.arena,W/2,260);
  // Rank
  const tier = getPlayerTier();
  cx.font='28px "Bebas Neue",sans-serif';cx.fillStyle='#ffd740';
  cx.fillText(tier.icon+' '+tier.name+' — '+playerElo+' ELO',W/2,320);
  // Streak
  if(koClipData.streak > 0){
    cx.font='24px "Bebas Neue",sans-serif';cx.fillStyle='#ff3d00';
    cx.fillText('🔥 '+koClipData.streak+' WIN STREAK',W/2,370);
  }
  // CTA
  cx.font='20px "Fredoka",sans-serif';cx.fillStyle='rgba(255,255,255,.5)';
  cx.fillText('Play CROC CLASH on TikTok!',W/2,480);
  cx.font='14px "Space Grotesk",sans-serif';cx.fillStyle='rgba(255,255,255,.25)';
  cx.fillText('croc-clash.tiktok.com',W/2,510);

  document.getElementById('share-info').textContent = `${koClipData.winner} defeated ${koClipData.loser} with ${koClipData.hits} hits!`;
}
document.getElementById('share-close')?.addEventListener('click', () => { const e=document.getElementById('share-screen'); e.classList.add('hidden'); e.style.display='none'; });
document.getElementById('btn-share-clip')?.addEventListener('click', showShareScreen);
document.getElementById('share-copy')?.addEventListener('click', () => {
  const url = window.location.origin + window.location.pathname + '?challenge=1';
  safeClipWrite('🐊 I just dominated in CROC CLASH! Can you beat my streak? ' + url);
});
document.getElementById('share-tiktok')?.addEventListener('click', () => {
  // TikTok Mini Games sharing API
  if(typeof TT !== 'undefined' && TT.isInTikTok()){
    TT.shareGame('🐊 CROC CLASH K.O.! ' + (koClipData ? koClipData.winner + ' WINS!' : 'Epic battle!'));
  } else {
    // Fallback: copy link
    const url = window.location.origin + window.location.pathname + '?challenge=1';
    safeClipWrite('🐊 CROC CLASH K.O.! ' + url);
    alert('Link copied! Share it on TikTok.');
  }
});

// Arena select
function showArenaSelect(){
  const el = document.getElementById('arena-select-overlay');
  el.classList.remove('hidden'); el.style.display='flex';
  const cards = document.getElementById('arena-cards');
  cards.innerHTML = ARENAS.map(a => {
    const unlocked = unlockedArenas.includes(a.id);
    const selected = currentArena.id === a.id;
    const colors = {boardwalk:'#ffd740',swamp:'#4ade80',rooftop:'#ff3d9a',colosseum:'#ff6a00'};
    return `<div class="arena-card" data-arena="${a.id}" style="display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:12px;cursor:${unlocked?'pointer':'not-allowed'};
      background:${selected?'rgba(255,215,64,.12)':'rgba(255,255,255,.03)'};border:1.5px solid ${selected?'rgba(255,215,64,.4)':'rgba(255,255,255,.06)'};
      opacity:${unlocked?1:0.45}">
      <div style="font-size:28px">${a.id==='boardwalk'?'🌉':a.id==='swamp'?'🌙':a.id==='colosseum'?'🔥':'🏙️'}</div>
      <div style="flex:1">
        <div style="font-family:var(--fh);font-size:16px;letter-spacing:.08em;color:${colors[a.id]||'var(--txt)'}">${a.name}</div>
        <div style="font-family:var(--fd);font-size:11px;color:var(--mut)">${unlocked?(selected?'SELECTED':'Click to select'):'🔒 '+a.unlock}</div>
      </div>
    </div>`;
  }).join('');
  // Bind clicks
  cards.querySelectorAll('.arena-card').forEach(c => {
    c.addEventListener('click', () => {
      const aid = c.dataset.arena;
      if(!unlockedArenas.includes(aid)) return;
      currentArena = ARENAS.find(a=>a.id===aid)||ARENAS[0];
      showArenaSelect(); // re-render
    });
  });
}
document.getElementById('arena-close')?.addEventListener('click', () => { const e=document.getElementById('arena-select-overlay'); e.classList.add('hidden'); e.style.display='none'; });

// Debug hook for testing
window._crocDebug = {
  setArena: (id) => { const a = ARENAS.find(x=>x.id===id); if(a){currentArena=a;if(!unlockedArenas.includes(id))unlockedArenas.push(id);} return currentArena.id; },
  getArena: () => currentArena.id,
  getPowers: (p) => p==='p1'?{p1:p1?.power1,p2:p1?.power2,p3:p1?.power3,p4:p1?.power4}:{p1:p2?.power1,p2:p2?.power2,p3:p2?.power3,p4:p2?.power4},
  getState: () => state,
  getSecretState: () => ({
    seqBuf: JSON.parse(JSON.stringify(_seqBuf)),
    p1: { fireAuraActive: p1?.fireAuraActive, fireAuraT: p1?.fireAuraT, laserEyesActive: p1?.laserEyesActive, laserEyesT: p1?.laserEyesT, secretAuraCD: p1?.secretAuraCD, secretLaserCD: p1?.secretLaserCD, hp: p1?.hp },
    p2: { fireAuraActive: p2?.fireAuraActive, fireAuraT: p2?.fireAuraT, laserEyesActive: p2?.laserEyesActive, laserEyesT: p2?.laserEyesT, secretAuraCD: p2?.secretAuraCD, secretLaserCD: p2?.secretLaserCD, hp: p2?.hp },
  }),
  forceFireAura: (who) => { if(who==='p1') activateFireballAura(p1,p2); else activateFireballAura(p2,p1); },
  forceLaserEyes: (who) => { if(who==='p1') activateLaserEyes(p1,p2); else activateLaserEyes(p2,p1); },
};

// ─── INIT VIRAL SYSTEMS ON BOOT ───
// Bind title screen viral buttons
document.getElementById('btn-arena')?.addEventListener('click', () => showArenaSelect());
document.getElementById('btn-ranks')?.addEventListener('click', () => showLeaderboard());

function initViralSystems(){
  pickDailyChallenge();
  initLeaderboard();
  // Roll mutator randomly (20% chance of special round)
  if(Math.random() < 0.2) activeMutator = rollMutator();
  else activeMutator = MUTATORS[0];
}

// ─── MAIN LOOP ───
function gameLoop(now){
  requestAnimationFrame(gameLoop);
  _frameCount++;
  const rawDt=Math.min((now-lastTS)/1000,.1);lastTS=now;gameTime+=rawDt;

  hsTimer=Math.max(0,hsTimer-rawDt);smTimer=Math.max(0,smTimer-rawDt);
  videoCooldown=Math.max(0,videoCooldown-rawDt);
  flashT=Math.max(0,flashT-rawDt);vigT=Math.max(0,vigT-rawDt);
  const tsc=timeScale(),dt=rawDt*tsc;

  updateShake(rawDt);updateCamera(dt);updateParts(dt);updateFloats(dt);
  if(mysteryBox)updateMysteryBox(dt);

  // Online guest: send input, interpolate received state, render
  if(isOnline && !amHost){
    sendLocalInputToHost(rawDt);
    guestInterpolate(rawDt);
    // Guest still ticks countdown locally for visual smoothness
    if(state==='countdown'){cdTimer-=rawDt;if(cdTimer<=0) state='playing';}
    if(p1&&p2 && (!PERF_LOW || _frameCount%3===0)) updateHUD();
    updateNetPing(rawDt);
  } else {
    // Host or local: run full simulation
    if(state==='countdown'){cdTimer-=rawDt;if(cdTimer<=0)startPlay()}
    if(state==='playing'){
      updateCroc(p1,getP1(),p2,dt);
      updateCroc(p2,getP2(),p1,dt);
      updateAllProjectiles(dt);
      roundTimer-=dt;
      if(!p1.alive)endRound(p2);else if(!p2.alive)endRound(p1);
      else if(roundTimer<=0){if(p1.hp>p2.hp)endRound(p1);else if(p2.hp>p1.hp)endRound(p2);else endRound(null)}
      if(!PERF_LOW || _frameCount%3===0) updateHUD();
    }
    if(state==='roundEnd'){updateCroc(p1,{},p2,dt);updateCroc(p2,{},p1,dt);if(!PERF_LOW || _frameCount%3===0) updateHUD();}
    // Host: clear ONLY one-shot actions from remote input (NOT held directional keys)
    if(isOnline && amHost){
      remoteInput.up=false;remoteInput.down=false;remoteInput.attack=false;remoteInput.dash=false;
      remoteInput.parry=false;remoteInput.launch=false;remoteInput.power1=false;remoteInput.power2=false;remoteInput.power3=false;remoteInput.power4=false;remoteInput.rage=false;
      hostBroadcastState(rawDt);
      updateNetPing(rawDt);
    }
  }

  // RENDER
  ctx.save();ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#050510';ctx.fillRect(0,0,W,H);
  // Bottom-anchored zoom: floor stays pinned at screen bottom,
  // game stays horizontally centered.
  const cW = PERF_LOW ? canvas.width : W; // actual canvas pixel width
  const cH = PERF_LOW ? canvas.height : H;
  const renderOx = (cW - AW * dynSc) / 2; // re-center X for current zoom
  const floorScreen = oy + AH * baseSc;     // floor pos in screen px (constant)
  const renderOy = floorScreen - AH * dynSc; // top-left Y so floor stays put
  ctx.translate(renderOx + shX * dynSc, renderOy + shY * dynSc);
  ctx.scale(dynSc, dynSc);

  drawArena(gameTime);

  if(state!=='title'){
    if(p1&&p2){
      if(p1.dead)drawCroc(p1);if(p2.dead)drawCroc(p2);
      if(!p1.dead)drawCroc(p1);if(!p2.dead)drawCroc(p2);
    }
    if(mysteryBox)drawMysteryBox();
    drawProjectiles();drawParts();drawFloats();drawSlam(rawDt);postFX(rawDt);
  } else {
    if(!PERF_LOW){const tv=ctx.createRadialGradient(AW/2,AH/2,AW*.2,AW/2,AH/2,AW*.7);
    tv.addColorStop(0,'transparent');tv.addColorStop(1,'rgba(0,0,0,.55)');
    ctx.fillStyle=tv;ctx.fillRect(0,0,AW,AH);}
  }

  // Online ping indicator (drawn in screen space, inside the scaled canvas)
  if(isOnline && state !== 'title'){
    const pingColor = netPingMs < 80 ? '#4ade80' : netPingMs < 150 ? '#fbbf24' : '#f87171';
    const pingLabel = netPingMs > 0 ? netPingMs + 'ms' : '...';
    ctx.save();
    ctx.font = '600 11px "Space Grotesk",sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(0,0,0,.4)';
    ctx.fillRect(AW - 62, 2, 60, 16);
    ctx.fillStyle = pingColor;
    ctx.fillText('\u{1F4F6} ' + pingLabel, AW - 6, 4);
    ctx.restore();
  }

  ctx.restore();
  for(const k in jp)delete jp[k];
  ts.attack=0;ts.dash=0;ts.parry=0;ts.launch=0;ts.power1=0;ts.power2=0;ts.power3=0;ts.power4=0;ts.rage=0;
  ts2.attack=0;ts2.dash=0;ts2.parry=0;ts2.launch=0;ts2.power1=0;ts2.power2=0;ts2.power3=0;ts2.power4=0;ts2.rage=0;
}

// ─── BOOT ───
loadImages(()=>{
  initVideoOverlay();
  loadNarration();
  updateTitleStreak();
  initViralSystems();

  // TikTok Mini Games SDK init
  if(typeof TT !== 'undefined'){
    TT.init();
    TT.setLoadingProgress(0.8); // assets loaded, almost ready
    TT.login(()=>{ TT.startEntranceMission(); TT.addShortcut(); });
  }
  requestAnimationFrame(gameLoop);
  // Load skins + non-critical images in background
  loadDeferredImages();
  // Signal TikTok that game is fully loaded and ready
  if(typeof TT !== 'undefined') TT.setLoadingProgress(1);

  // Auto-join if ?room=XXXX in URL (P2 opened invite link)
  const urlParams = new URLSearchParams(window.location.search);
  const autoRoom = urlParams.get('room');
  if(autoRoom && autoRoom.length >= 4){
    initAudio();
    // Show lobby and auto-join after connection is ready
    const el = document.getElementById('online-lobby');
    if(el) el.classList.remove('hidden');
    document.getElementById('title-screen').classList.add('hidden');
    document.getElementById('lobby-status').textContent = 'Joining room ' + autoRoom.toUpperCase() + '...';
    document.getElementById('lobby-actions').style.display = 'none';
    document.getElementById('lobby-waiting').style.display = 'none';
    document.getElementById('lobby-error').textContent = '';
    
    // Set up callbacks then connect
    if(typeof MP !== 'undefined'){
      MP.onJoinedRoom = (num, code) => {
        amHost = false;
        document.getElementById('lobby-status').textContent = 'Joined room ' + code + '! Starting...';
        document.getElementById('lobby-waiting').style.display = 'block';
        document.getElementById('lobby-waiting').querySelector('div').textContent = 'Connected! Starting game...';
        setTimeout(() => launchOnlineGame(), 1200);
      };
      MP.onOpponentJoined = () => {
        document.getElementById('lobby-waiting').querySelector('div').textContent = 'Opponent joined! Starting...';
        setTimeout(() => launchOnlineGame(), 800);
      };
      MP.onOpponentLeft = () => {
        if(state==='title') return;
        isOnline=false;state='title';
        document.getElementById('title-screen').classList.remove('hidden');
        document.getElementById('hud').classList.add('hidden');
        document.getElementById('result-screen').classList.add('hidden');
        document.getElementById('loadout-screen').classList.add('hidden');
        document.getElementById('online-lobby').classList.add('hidden');
        hideTouchControls();hideKeyLegend();hideVideo();
        slam('OPPONENT LEFT','#f87171',2);
      };
      MP.onStateUpdate = (s) => { if(isOnline && !amHost) applyGameState(s); };
      MP.onOpponentInput = (inp) => {
        if(isOnline && amHost){
          remoteInput.left=!!inp.left;remoteInput.right=!!inp.right;
          remoteInput.up=remoteInput.up||!!inp.up;
          remoteInput.down=remoteInput.down||!!inp.down;
          remoteInput.attack=remoteInput.attack||!!inp.attack;
          remoteInput.dash=remoteInput.dash||!!inp.dash;
          remoteInput.parry=remoteInput.parry||!!inp.parry;
          remoteInput.launch=remoteInput.launch||!!inp.launch;
          remoteInput.power1=remoteInput.power1||!!inp.power1;
          remoteInput.power2=remoteInput.power2||!!inp.power2;
          remoteInput.rage=remoteInput.rage||!!inp.rage;
        }
      };
      MP.onError = (msg) => {
        document.getElementById('lobby-error').textContent = msg;
      };
      MP.onDisconnect = () => {
        document.getElementById('lobby-status').textContent = 'Disconnected';
      };

      MP.connect().then((ok) => {
        if(ok){
          MP.joinRoom(autoRoom.toUpperCase());
          // Clean URL
          if(window.history.replaceState) window.history.replaceState({}, '', location.pathname);
        } else {
          document.getElementById('lobby-error').textContent = 'Could not connect to server.';
          document.getElementById('lobby-status').textContent = 'Connection failed';
        }
      });
    }
  }
});

// ─── ON-SCREEN KEY LEGEND (desktop only) ───
const LEGEND_ACTIONS = [
  {key:'left',  label:'←'}, {key:'right', label:'→'},
  {key:'up',    label:'Jump'}, {key:'down',  label:'Crouch'},
  {key:'attack',label:'Smack'}, {key:'dash',  label:'Dash'},
  {key:'parry', label:'Parry'}, {key:'launch',label:'🎯'},
  {key:'power1',label:'Pow1'}, {key:'power2',label:'Pow2'},
  {key:'rage',  label:'Rage'}
];

function renderKeyLegend(){
  const p1el = $('kleg-p1'), p2el = $('kleg-p2');
  if(!p1el) return;
  function buildHTML(player, title, colorClass){
    const b = keyBinds[player];
    let h = `<span class="kleg-title ${colorClass}">${title}</span>`;
    LEGEND_ACTIONS.forEach(a => {
      h += `<span class="kleg-item"><kbd>${codeToLabel(b[a.key])}</kbd>${a.label}</span>`;
    });
    return h;
  }
  p1el.innerHTML = buildHTML('p1','GARY (P1)','p1t');
  if(!isAI && !isOnline){
    p2el.innerHTML = buildHTML('p2','CARL (P2)','p2t');
    p2el.style.display = '';
  } else {
    p2el.innerHTML = '';
    p2el.style.display = 'none';
  }
}

function showKeyLegend(){
  const el = $('key-legend');
  if(el){ el.classList.add('show'); renderKeyLegend(); }
}
function hideKeyLegend(){
  const el = $('key-legend');
  if(el) el.classList.remove('show');
}

// ─── CONTROLS CUSTOMIZATION UI ───
function updateControlsDisplay(){
  renderKeyLegend(); // refresh on-screen key legend
  const d = $('controls-display');
  if(!d) return;
  const b1 = keyBinds.p1, b2 = keyBinds.p2;
  d.innerHTML = 
    `<b>P1:</b> <b>${codeToLabel(b1.left)}</b><b>${codeToLabel(b1.right)}</b><b>${codeToLabel(b1.up)}</b><b>${codeToLabel(b1.down)}</b> move · ` +
    `<b>${codeToLabel(b1.attack)}</b> smack · <b>${codeToLabel(b1.dash)}</b> dash · <b>${codeToLabel(b1.parry)}</b> parry · ` +
    `<b>${codeToLabel(b1.launch)}</b> 🎯 launch · <b>${codeToLabel(b1.power1)}</b> Pow1 · <b>${codeToLabel(b1.power2)}</b> Pow2<br/>` +
    `<b>P2:</b> <b>${codeToLabel(b2.left)}</b><b>${codeToLabel(b2.right)}</b><b>${codeToLabel(b2.up)}</b><b>${codeToLabel(b2.down)}</b> move · ` +
    `<b>${codeToLabel(b2.attack)}</b> smack · <b>${codeToLabel(b2.dash)}</b> dash · <b>${codeToLabel(b2.parry)}</b> parry · ` +
    `<b>${codeToLabel(b2.launch)}</b> 🎯 launch · <b>${codeToLabel(b2.power1)}</b> Pow1 · <b>${codeToLabel(b2.power2)}</b> Pow2<br/>` +
    `<b>${codeToLabel(b1.rage)}</b> Rage (P1) · <b>${codeToLabel(b2.rage)}</b> Rage (P2) — 15s cooldown mega bomb`;
}

let listeningForBind = null; // { player:'p1'|'p2', action:string, el:HTMLElement }

function renderBindsGrid(){
  const grid = $('binds-grid');
  if(!grid) return;
  grid.innerHTML = '';
  ['p1','p2'].forEach(player => {
    const section = document.createElement('div');
    section.className = 'bind-section';
    const label = player === 'p1' ? '🐊 GATOR GARY (P1)' : '🐊 CROC CARL (P2)';
    const color = player === 'p1' ? '#4ade80' : '#f472b6';
    section.innerHTML = `<h3 style="color:${color}">${label}</h3>`;
    const actions = Object.keys(ACTION_LABELS);
    actions.forEach(action => {
      const row = document.createElement('div');
      row.className = 'bind-row';
      const code = keyBinds[player][action];
      row.innerHTML = `<span class="bind-label">${ACTION_LABELS[action]}</span><span class="bind-key" data-player="${player}" data-action="${action}">${codeToLabel(code)}</span>`;
      section.appendChild(row);
    });
    grid.appendChild(section);
  });
  // Attach click listeners to all bind keys
  grid.querySelectorAll('.bind-key').forEach(el => {
    el.addEventListener('click', () => startListening(el));
  });
}

function startListening(el){
  // Cancel any previous listener
  if(listeningForBind && listeningForBind.el){
    listeningForBind.el.classList.remove('listening');
    listeningForBind.el.textContent = codeToLabel(keyBinds[listeningForBind.player][listeningForBind.action]);
  }
  el.classList.add('listening');
  el.textContent = 'Press a key...';
  listeningForBind = { player: el.dataset.player, action: el.dataset.action, el };
}

// Listen for key presses to rebind
document.addEventListener('keydown', function bindListener(e){
  if(!listeningForBind) return;
  if(e.code === 'Escape'){
    // Cancel
    listeningForBind.el.classList.remove('listening');
    listeningForBind.el.textContent = codeToLabel(keyBinds[listeningForBind.player][listeningForBind.action]);
    listeningForBind = null;
    return;
  }
  e.preventDefault(); e.stopPropagation();
  const { player, action, el } = listeningForBind;
  keyBinds[player][action] = e.code;
  saveBindings();
  el.classList.remove('listening');
  el.textContent = codeToLabel(e.code);
  listeningForBind = null;
  updateControlsDisplay();
}, true); // capture phase so it runs before game input

// Open/close controls screen
$('btn-controls').addEventListener('click', () => {
  renderBindsGrid();
  $('controls-screen').classList.remove('hidden');
});
$('btn-close-controls').addEventListener('click', () => {
  $('controls-screen').classList.add('hidden');
  if(listeningForBind){ listeningForBind.el.classList.remove('listening'); listeningForBind = null; }
});
$('btn-reset-binds').addEventListener('click', () => {
  keyBinds = { p1:{...DEFAULT_BINDS_P1}, p2:{...DEFAULT_BINDS_P2} };
  saveBindings();
  renderBindsGrid();
  updateControlsDisplay();
});

// Initial render
updateControlsDisplay();

// ─── NAME ENTRY SYSTEM ───
function showNameEntry(isChange){
  const el = $('name-entry');
  const inp = $('name-input');
  const err = $('name-error');
  el.classList.remove('hidden'); el.style.display='flex';
  inp.value = isChange ? playerName : '';
  err.textContent = '';
  setTimeout(()=>inp.focus(), 100);
}
function hideNameEntry(){
  const el = $('name-entry');
  el.classList.add('hidden'); el.style.display='none';
}
function confirmName(){
  const inp = $('name-input');
  const err = $('name-error');
  let name = inp.value.trim().toUpperCase().replace(/[^A-Z0-9_ \-]/g,'');
  if(name.length < 2){ err.textContent = 'Name must be at least 2 characters'; inp.focus(); return; }
  if(name.length > 12){ name = name.slice(0,12); }
  playerName = name;
  savePlayerData();
  // Update leaderboard entry name
  const me = leaderboard.find(e=>!e.isBot);
  if(me) me.name = playerName;
  updateTitleStreak();
  updateTitlePlayerName();
  hideNameEntry();
  $('title-screen').classList.remove('hidden');
}
function updateTitlePlayerName(){
  const el = $('title-playername');
  if(el && playerName) el.textContent = '\u{1F464} ' + playerName;
  else if(el) el.textContent = '';
}

// Name confirm button
$('name-confirm').addEventListener('click', confirmName);
// Enter key confirms name
$('name-input').addEventListener('keydown', (e)=>{ if(e.key==='Enter') confirmName(); });
// Change name button on title screen
$('btn-changename').addEventListener('click', ()=>{
  $('title-screen').classList.add('hidden');
  showNameEntry(true);
});

// ─── ROTATE HINT (mobile portrait only) ───
(function initRotateHint(){
  if(!IS_MOBILE) return;
  const hint = $('rotate-hint');
  if(!hint) return;
  function check(){
    const portrait = window.innerHeight > window.innerWidth;
    hint.style.display = portrait ? 'block' : 'none';
  }
  check();
  window.addEventListener('resize', check);
  screen.orientation && screen.orientation.addEventListener('change', check);
})();

// On boot: if no name saved, show name entry instead of title
(function checkNameOnBoot(){
  if(!playerName){
    $('title-screen').classList.add('hidden');
    showNameEntry(false);
  } else {
    updateTitlePlayerName();
  }
})();


})();
