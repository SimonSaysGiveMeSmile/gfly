import type { LocalDict } from "@/lib/i18n";

export type SudokuKey =
  | "lobby.title" | "lobby.body" | "lobby.sit" | "easy" | "medium" | "hard"
  | "you" | "turn.you" | "turn.fly" | "turn.pass" | "solved" | "filled" | "conflicts" | "new" | "clear" | "keys"
  | "view.seat" | "view.top" | "brains" | "brains.title" | "caption" | "brain.note" | "safe" | "guess";

export const dict: LocalDict<SudokuKey> = {
  en: {
    "lobby.title": "Pull up a chair",
    "lobby.body": "A paper sudoku on the tea table, filled in together. You write a digit, then each fly writes one in turn. It loads the flies and the furniture once, about 3 MB.",
    "lobby.sit": "Sit down",
    easy: "Easy", medium: "Medium", hard: "Hard",
    you: "You", "turn.you": "Your digit", "turn.fly": "{name} is writing", "turn.pass": "{name} found nothing safe to write and passed.",
    solved: "Solved, together.", filled: "{n} of 81", conflicts: "{n} conflicts",
    new: "New puzzle", clear: "Clear", keys: "Tap a cell, then a digit. Keys 1–9 work too.",
    "view.seat": "Seat", "view.top": "Above", brains: "Brains",
    "brains.title": "Let each fly's connectome choose which digit to write",
    caption: "Each fly writes what its candidates allow, easiest cell first. With Brains on, the connectome sees the candidate digits and writes the one its mushroom body likes most; it is rewarded when that cell had only one possible digit and punished when it was a guess. Your own digits are blue, the flies' green, orange and purple, and anything that breaks a row, column or box turns red.",
    "brain.note": "Three live copies of the {tier} brain. Each one chooses among its candidate digits and learns which were safe to write.",
    safe: "safe", guess: "a guess",
  },
  zh: {
    "lobby.title": "拉把椅子",
    "lobby.body": "茶桌上的纸质数独，大家一起填。你写一个数字，然后三只果蝇轮流各写一个。首次加载果蝇和家具约 3 MB。",
    "lobby.sit": "坐下",
    easy: "简单", medium: "中等", hard: "困难",
    you: "你", "turn.you": "该你写了", "turn.fly": "{name} 正在写", "turn.pass": "{name} 没有找到可以安全写下的数字，跳过。",
    solved: "一起解开了。", filled: "已填 {n}/81", conflicts: "{n} 处冲突",
    new: "新题", clear: "清除", keys: "点一个格子，再点一个数字，也可以按 1–9 键。",
    "view.seat": "座位", "view.top": "俯视", brains: "大脑",
    "brains.title": "让每只果蝇的连接组决定写哪个数字",
    caption: "每只果蝇写它的候选数允许的数字，先填最容易的格子。开启「大脑」后，连接组看到候选数字并写下蘑菇体最喜欢的那个；如果那个格子只有一个可能的数字则获得奖励，如果是猜的则受到惩罚。你写的数字为蓝色，果蝇的为绿、橙、紫色，破坏行、列或宫的数字变红。",
    "brain.note": "三个实时运行的{tier}大脑副本。每只果蝇在候选数字中选择，并学习哪些是可以安全写下的。",
    safe: "安全", guess: "猜测",
  },
  az: {
    "lobby.title": "Stul çəkin",
    "lobby.body": "Çay masasında kağız sudoku, birlikdə doldurulur. Siz bir rəqəm yazırsınız, sonra hər milçək növbə ilə birini yazır. Milçəklər və mebel bir dəfə, təxminən 3 MB yüklənir.",
    "lobby.sit": "Otur",
    easy: "Asan", medium: "Orta", hard: "Çətin",
    you: "Siz", "turn.you": "Sizin rəqəminiz", "turn.fly": "{name} yazır", "turn.pass": "{name} yazmağa təhlükəsiz heç nə tapmadı və keçdi.",
    solved: "Birlikdə həll olundu.", filled: "81-dən {n}", conflicts: "{n} ziddiyyət",
    new: "Yeni tapmaca", clear: "Təmizlə", keys: "Xanaya, sonra rəqəmə toxunun. 1–9 düymələri də işləyir.",
    "view.seat": "Oturacaq", "view.top": "Yuxarıdan", brains: "Beyinlər",
    "brains.title": "Hansı rəqəmi yazmağı hər milçəyin konnektomuna verin",
    caption: "Hər milçək namizədlərinin icazə verdiyini yazır, əvvəlcə ən asan xananı. Beyinlər açıq olduqda konnektom namizəd rəqəmləri görür və göbələk cisminin ən çox bəyəndiyini yazır; həmin xanada yalnız bir mümkün rəqəm olduqda mükafat, təxmin olduqda cəza alır. Sizin rəqəmləriniz mavi, milçəklərinki yaşıl, narıncı və bənövşəyidir; sətri, sütunu və ya qutunu pozan hər şey qırmızı olur.",
    "brain.note": "{tier} beynin üç canlı nüsxəsi. Hər biri namizəd rəqəmləri arasında seçir və hansıların yazılmasının təhlükəsiz olduğunu öyrənir.",
    safe: "təhlükəsiz", guess: "təxmin",
  },
};
