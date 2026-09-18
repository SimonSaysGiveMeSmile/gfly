import type { LocalDict } from "@/lib/i18n";

export type GoKey =
  | "lobby.title" | "lobby.body" | "lobby.sit" | "black" | "white" | "you" | "turn.you" | "turn.fly" | "passed"
  | "over" | "youWin" | "flyWins" | "score" | "captures" | "pass" | "new" | "moves"
  | "view.seat" | "view.top" | "brains" | "brains.title" | "caption" | "brain.note";

export const dict: LocalDict<GoKey> = {
  en: {
    "lobby.title": "Take black",
    "lobby.body": "A 9×9 go board on the tea table, and one fly on the stool across from you playing white. Area scoring, komi 6.5. It loads the fly and the furniture once, about 3 MB.",
    "lobby.sit": "Sit down",
    black: "Black", white: "White", you: "You",
    "turn.you": "Your stone", "turn.fly": "{name} is thinking", passed: "{name} passed",
    over: "Game over", youWin: "You win by {n}.", flyWins: "{name} wins by {n}.",
    score: "Black {b} · White {w}", captures: "{n} taken",
    pass: "Pass", new: "New game", moves: "Moves",
    "view.seat": "Seat", "view.top": "Above", brains: "Brains",
    "brains.title": "Let the fly's connectome choose between the candidate points",
    caption: "Click or tap an empty point to play. Two passes in a row end the game and the board is scored by area: stones plus the empty points only one side touches; dead stones are not judged, so capture them first. The fly rates every point by captures, escapes, atari and shape; with Brains on, its mushroom body looks at the top three and plays the one it likes most, rewarded when that was the best of them and punished when it was the worst.",
    "brain.note": "One live copy of the {tier} brain, for the fly across the table. It picks between the best points and learns from how they rank.",
  },
  zh: {
    "lobby.title": "执黑入座",
    "lobby.body": "茶桌上的九路围棋，对面凳子上坐着一只执白的果蝇。数子法，贴目 6.5。首次加载果蝇和家具约 3 MB。",
    "lobby.sit": "坐下",
    black: "黑方", white: "白方", you: "你",
    "turn.you": "该你落子", "turn.fly": "{name} 在思考", passed: "{name} 虚手",
    over: "终局", youWin: "你赢 {n} 子。", flyWins: "{name} 赢 {n} 子。",
    score: "黑 {b} · 白 {w}", captures: "提 {n} 子",
    pass: "虚手", new: "新对局", moves: "手数",
    "view.seat": "座位", "view.top": "俯视", brains: "大脑",
    "brains.title": "让果蝇的连接组在候选点中选择",
    caption: "点击或点按空点落子。连续两次虚手即终局，按数子法计分：己方棋子加上只与己方相邻的空点；不判断死子，请先提掉。果蝇按提子、逃气、叫吃和棋形给每个点打分；开启「大脑」后，它的蘑菇体会看前三个候选并走它最喜欢的那个，走到最优则获奖励，走到最差则受惩罚。",
    "brain.note": "一个实时运行的{tier}大脑副本，属于对面的果蝇。它在最佳点之间选择，并从它们的排名中学习。",
  },
  az: {
    "lobby.title": "Qara daşları götürün",
    "lobby.body": "Çay masasında 9×9 go lövhəsi, qarşınızdakı kətildə ağ oynayan bir milçək. Sahə hesabı, komi 6.5. Milçək və mebel bir dəfə, təxminən 3 MB yüklənir.",
    "lobby.sit": "Otur",
    black: "Qara", white: "Ağ", you: "Siz",
    "turn.you": "Sizin daşınız", "turn.fly": "{name} düşünür", passed: "{name} keçdi",
    over: "Oyun bitdi", youWin: "{n} fərqlə qalib gəldiniz.", flyWins: "{name} {n} fərqlə qalib gəldi.",
    score: "Qara {b} · Ağ {w}", captures: "{n} alınıb",
    pass: "Keç", new: "Yeni oyun", moves: "Gedişlər",
    "view.seat": "Oturacaq", "view.top": "Yuxarıdan", brains: "Beyinlər",
    "brains.title": "Namizəd nöqtələr arasında seçimi milçəyin konnektomuna verin",
    caption: "Oynamaq üçün boş nöqtəyə toxunun. Ardıcıl iki keçid oyunu bitirir və lövhə sahə ilə hesablanır: daşlar üstəgəl yalnız bir tərəfin toxunduğu boş nöqtələr; ölü daşlar mühakimə olunmur, əvvəlcə onları alın. Milçək hər nöqtəni almalar, qaçışlar, atari və forma ilə qiymətləndirir; Beyinlər açıq olduqda göbələk cismi ilk üçə baxır və ən çox bəyəndiyini oynayır, ən yaxşı olanda mükafat, ən pis olanda cəza alır.",
    "brain.note": "{tier} beynin bir canlı nüsxəsi, masanın o tayındakı milçək üçün. Ən yaxşı nöqtələr arasında seçir və sıralamadan öyrənir.",
  },
};
