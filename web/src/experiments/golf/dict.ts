import type { LocalDict } from "@/lib/i18n";

export type GolfKey =
  | "lobby.title" | "lobby.body" | "lobby.sit" | "you" | "turn.you" | "turn.fly" | "rolling" | "hole" | "par" | "strokes" | "total"
  | "putt" | "next" | "new" | "aim" | "last.in" | "last.close" | "last.far" | "pickup" | "youWin" | "flyWins" | "tie"
  | "view.seat" | "view.top" | "brains" | "brains.title" | "caption" | "brain.note";

export const dict: LocalDict<GolfKey> = {
  en: {
    "lobby.title": "Five holes",
    "lobby.body": "A green in the garden with slopes to read, at your size, five holes against one fly. Fewest strokes wins. It loads the fly once, about 3 MB.",
    "lobby.sit": "Tee off",
    you: "You", "turn.you": "Your putt", "turn.fly": "{name} is reading the green", rolling: "Rolling",
    hole: "Hole {n}", par: "par {n}", strokes: "{n} strokes", total: "Total",
    putt: "Putt", next: "Next hole", new: "New round",
    aim: "Click where the ball should come to rest.",
    "last.in": "In.", "last.close": "Close: {n} cm from the cup.", "last.far": "{n} cm from the cup.", pickup: "Picked up after {n}.",
    youWin: "You win the round, {a} to {b}.", flyWins: "{name} wins the round, {b} to {a}.", tie: "All square at {a}.",
    "view.seat": "Seat", "view.top": "Above", brains: "Brains",
    "brains.title": "Let the fly's connectome choose between its lines",
    caption: "Move the pointer over the green and click where the ball would stop on a flat green; the ball then rolls down whatever slope it meets, so read the break and aim up the hill. The cup takes it if it arrives slowly; the fringe and the rough slow it hard. The one farther from the cup putts next; six strokes and you pick up. The fly reads the green by trying lines either side of the cup at a few paces in the same simulation you see, and with Brains on its mushroom body chooses among the best three and learns from where the ball finished.",
    "brain.note": "One live copy of the {tier} brain, for the fly across the green. It picks between the best lines and learns from where they finish.",
  },
  zh: {
    "lobby.title": "五个洞",
    "lobby.body": "花园里一片有坡度可读的果岭，按你的尺寸，五个洞，对手是一只果蝇。杆数少者胜。首次加载果蝇约 3 MB。",
    "lobby.sit": "开球",
    you: "你", "turn.you": "该你推杆", "turn.fly": "{name} 在读果岭", rolling: "球在滚",
    hole: "第 {n} 洞", par: "标准杆 {n}", strokes: "{n} 杆", total: "总杆",
    putt: "推杆", next: "下一洞", new: "新一轮",
    aim: "点击你想让球停下的位置。",
    "last.in": "进洞。", "last.close": "很近：离洞 {n} 厘米。", "last.far": "离洞 {n} 厘米。", pickup: "{n} 杆后捡起。",
    youWin: "你赢了这一轮，{a} 比 {b}。", flyWins: "{name} 赢了这一轮，{b} 比 {a}。", tie: "平局，各 {a} 杆。",
    "view.seat": "座位", "view.top": "俯视", brains: "大脑",
    "brains.title": "让果蝇的连接组在候选线路中选择",
    caption: "把指针移到果岭上，点击球应该停下的地方；引擎把球滚到那里，途中会从边框和木块上弹回，到达时够慢就会进洞。双方轮流推杆；六杆后捡起。果蝇用你看到的同一个模拟读直推、慢推和从每条边借力的线路；开启「大脑」后，它的蘑菇体在最好的三条中选择，并从球停下的位置中学习。",
    "brain.note": "一个实时运行的{tier}大脑副本，属于果岭对面的果蝇。它在最佳线路中选择，并从球的落点中学习。",
  },
  az: {
    "lobby.title": "Beş çuxur",
    "lobby.body": "Bağda, sizin ölçünüzdə, oxunası yamacları olan bir grin, beş çuxur, bir milçəyə qarşı. Ən az vuruş qalib gəlir. Milçək bir dəfə, təxminən 3 MB yüklənir.",
    "lobby.sit": "Başla",
    you: "Siz", "turn.you": "Sizin vuruşunuz", "turn.fly": "{name} sahəni oxuyur", rolling: "Top gedir",
    hole: "Çuxur {n}", par: "par {n}", strokes: "{n} vuruş", total: "Cəmi",
    putt: "Vur", next: "Növbəti çuxur", new: "Yeni raund",
    aim: "Topun dayanmalı olduğu yerə toxunun.",
    "last.in": "Düşdü.", "last.close": "Yaxın: çuxurdan {n} sm.", "last.far": "Çuxurdan {n} sm.", pickup: "{n} vuruşdan sonra götürüldü.",
    youWin: "Raundu siz udunuz, {a} – {b}.", flyWins: "Raundu {name} uddu, {b} – {a}.", tie: "Bərabər, {a}.",
    "view.seat": "Oturacaq", "view.top": "Yuxarıdan", brains: "Beyinlər",
    "brains.title": "Xətlər arasında seçimi milçəyin konnektomuna verin",
    caption: "Göstəricini sahənin üstündə gəzdirin və topun dayanmalı olduğu yerə toxunun; mühərrik onu ora yuvarlayır, yolda kənardan və bloklardan qayıdır, yavaş çatanda çuxur onu qəbul edir. Vuruşlar növbə ilədir; altı vuruşdan sonra top götürülür. Milçək gördüyünüz eyni simulyasiyada düz vuruşu, qısa vuruşu və hər kənardan qayıtmanı oxuyur, Beyinlər açıq olduqda göbələk cismi ən yaxşı üçdən birini seçib topun harada dayandığından öyrənir.",
    "brain.note": "{tier} beynin bir canlı nüsxəsi, sahənin o tayındakı milçək üçün. Ən yaxşı xətlər arasında seçir və harada dayandıqlarından öyrənir.",
  },
};
