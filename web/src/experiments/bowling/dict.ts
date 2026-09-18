import type { LocalDict } from "@/lib/i18n";

export type BowlingKey =
  | "lobby.title" | "lobby.body" | "lobby.sit" | "you" | "turn.you" | "turn.fly" | "rolling" | "frame" | "total"
  | "hook" | "hook.left" | "hook.straight" | "hook.right" | "roll" | "new" | "aim"
  | "last.strike" | "last.spare" | "last.gutter" | "last.pins" | "youWin" | "flyWins" | "tie"
  | "view.seat" | "view.top" | "brains" | "brains.title" | "caption" | "brain.note";

export const dict: LocalDict<BowlingKey> = {
  en: {
    "lobby.title": "Pick a ball",
    "lobby.body": "Ten frames on a tabletop lane in the saloon, against one fly in a hat. Real scoring: strikes, spares, the tenth frame's extra balls. It loads the fly and the furniture once, about 4 MB.",
    "lobby.sit": "Step up",
    you: "You", "turn.you": "Your ball", "turn.fly": "{name} is on the approach", rolling: "Rolling",
    frame: "Frame {n}", total: "Total",
    hook: "Hook", "hook.left": "Left", "hook.straight": "Straight", "hook.right": "Right",
    roll: "Roll", new: "New game",
    aim: "Point at the pins to pick a line; choose a hook; click the lane or press Roll.",
    "last.strike": "Strike!", "last.spare": "Spare.", "last.gutter": "Gutter.", "last.pins": "{n} down.",
    youWin: "You win, {a} to {b}.", flyWins: "{name} wins, {b} to {a}.", tie: "A tie, {a} each.",
    "view.seat": "Seat", "view.top": "Above", brains: "Brains",
    "brains.title": "Let the fly's connectome choose between its lines",
    caption: "Move the pointer across the pin deck to choose where the ball should arrive, pick a hook so it curves in late, then click the lane or press Roll. Pins fall away from the ball and take the pins behind them. The fly rolls a few lines a bowler would try in the same simulation you watch, pockets, the head pin, whatever is left standing, and with Brains on its mushroom body chooses among the best three and learns from the pin count.",
    "brain.note": "One live copy of the {tier} brain, for the fly across the lane. It picks between the best lines and learns from what falls.",
  },
  zh: {
    "lobby.title": "选一个球",
    "lobby.body": "酒馆里桌面球道上的十格保龄球，对手是一只戴帽子的果蝇。真实计分：全中、补中、第十格的加球。首次加载果蝇和家具约 4 MB。",
    "lobby.sit": "上前",
    you: "你", "turn.you": "该你投球", "turn.fly": "{name} 在助跑", rolling: "球在滚",
    frame: "第 {n} 格", total: "总分",
    hook: "弧线", "hook.left": "左弧", "hook.straight": "直线", "hook.right": "右弧",
    roll: "投球", new: "新一局",
    aim: "指向球瓶选择路线，选一个弧线，点击球道或按「投球」。",
    "last.strike": "全中！", "last.spare": "补中。", "last.gutter": "洗沟。", "last.pins": "倒了 {n} 个。",
    youWin: "你赢了，{a} 比 {b}。", flyWins: "{name} 赢了，{b} 比 {a}。", tie: "平局，各 {a} 分。",
    "view.seat": "座位", "view.top": "俯视", brains: "大脑",
    "brains.title": "让果蝇的连接组在候选路线中选择",
    caption: "在瓶区上移动指针选择球到达的位置，选一个弧线让球在后半段拐进来，然后点击球道或按「投球」。球瓶朝远离球的方向倒下并撞倒身后的瓶。果蝇用你看到的同一个模拟试几条保龄球手会走的线：1-3 袋、1-2 袋、正对一号瓶、以及剩下的瓶；开启「大脑」后，它的蘑菇体在最好的三条中选择，并从倒瓶数中学习。",
    "brain.note": "一个实时运行的{tier}大脑副本，属于球道对面的果蝇。它在最佳路线中选择，并从倒瓶结果中学习。",
  },
  az: {
    "lobby.title": "Top seçin",
    "lobby.body": "Salunda masaüstü cığırda on freym, papaqlı bir milçəyə qarşı. Əsl hesab: strayklar, speyrlər, onuncu freymin əlavə topları. Milçək və mebel bir dəfə, təxminən 4 MB yüklənir.",
    "lobby.sit": "Yaxınlaşın",
    you: "Siz", "turn.you": "Sizin topunuz", "turn.fly": "{name} yaxınlaşır", rolling: "Top gedir",
    frame: "Freym {n}", total: "Cəmi",
    hook: "Əyri", "hook.left": "Sol", "hook.straight": "Düz", "hook.right": "Sağ",
    roll: "At", new: "Yeni oyun",
    aim: "Xətt seçmək üçün kəgillərə yönəlin; əyri seçin; cığıra toxunun və ya At düyməsini basın.",
    "last.strike": "Strayk!", "last.spare": "Speyr.", "last.gutter": "Kanala düşdü.", "last.pins": "{n} yıxıldı.",
    youWin: "Siz udunuz, {a} – {b}.", flyWins: "{name} uddu, {b} – {a}.", tie: "Heç-heçə, hərəyə {a}.",
    "view.seat": "Oturacaq", "view.top": "Yuxarıdan", brains: "Beyinlər",
    "brains.title": "Xətlər arasında seçimi milçəyin konnektomuna verin",
    caption: "Topun çatacağı yeri seçmək üçün göstəricini kəgil sırasında gəzdirin, gec dönsün deyə əyri seçin, sonra cığıra toxunun və ya At düyməsini basın. Kəgillər topdan uzağa yıxılır və arxadakıları da aparır. Milçək gördüyünüz eyni simulyasiyada boulinqçinin sınayacağı bir neçə xətti atır, ciblər, baş kəgil, nə qalıbsa, və Beyinlər açıq olduqda göbələk cismi ən yaxşı üçdən birini seçib yıxılan sayından öyrənir.",
    "brain.note": "{tier} beynin bir canlı nüsxəsi, cığırın o tayındakı milçək üçün. Ən yaxşı xətlər arasında seçir və nəyin yıxıldığından öyrənir.",
  },
};
