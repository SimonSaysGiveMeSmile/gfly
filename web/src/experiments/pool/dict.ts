import type { LocalDict } from "@/lib/i18n";

export type PoolKey =
  | "lobby.title" | "lobby.body" | "lobby.sit" | "you" | "turn.you" | "turn.fly" | "rolling"
  | "open" | "solids" | "stripes" | "left" | "power" | "shoot" | "new"
  | "last.potted" | "last.scratch" | "last.foul" | "last.miss" | "youWin" | "flyWins" | "aim"
  | "view.seat" | "view.top" | "brains" | "brains.title" | "caption" | "brain.note";

export const dict: LocalDict<PoolKey> = {
  en: {
    "lobby.title": "Rack them up",
    "lobby.body": "Eight-ball on a little table in the saloon, against one fly in a hat. Solids and stripes, the eight last. It loads the fly and the furniture once, about 4 MB.",
    "lobby.sit": "Chalk up",
    you: "You", "turn.you": "Your shot", "turn.fly": "{name} is lining up", rolling: "Rolling",
    open: "Table open", solids: "Solids", stripes: "Stripes", left: "{n} left",
    power: "Power", shoot: "Shoot", new: "New rack",
    "last.potted": "Potted. Shoot again.", "last.scratch": "Scratch: cue ball in hand at the head spot.", "last.foul": "Foul: wrong ball first.", "last.miss": "Nothing down.",
    youWin: "You win the rack.", flyWins: "{name} wins the rack.",
    aim: "Point where you want the cue ball to go; drag the power; shoot.",
    "view.seat": "Seat", "view.top": "Above", brains: "Brains",
    "brains.title": "Let the fly's connectome choose between its candidate shots",
    caption: "Move the pointer over the table to aim, set the power, then click the table or press Shoot. Groups are set by the first ball potted after the break; pot the eight before your group is clear and you lose. A scratch or hitting the wrong ball first hands the cue ball over at the head spot. The fly tries every pocket for every ball it may hit in the same simulation you see, keeps the shots that are not blocked, and with Brains on its mushroom body chooses among the three best and learns from what the table gave back.",
    "brain.note": "One live copy of the {tier} brain, for the fly across the table. It picks between the best shots and learns from what they pot.",
  },
  zh: {
    "lobby.title": "摆好球",
    "lobby.body": "酒馆里的小桌台球，对手是一只戴帽子的果蝇。全色与花色，8 号球最后打。首次加载果蝇和家具约 4 MB。",
    "lobby.sit": "擦好巧克",
    you: "你", "turn.you": "该你击球", "turn.fly": "{name} 在瞄准", rolling: "球在滚",
    open: "开放台面", solids: "全色球", stripes: "花色球", left: "剩 {n} 个",
    power: "力度", shoot: "击球", new: "重新摆球",
    "last.potted": "进球，继续。", "last.scratch": "母球落袋：对方在开球点自由摆球。", "last.foul": "犯规：先碰到了对方的球。", "last.miss": "没有进球。",
    youWin: "你赢了这局。", flyWins: "{name} 赢了这局。",
    aim: "指向母球要去的方向，拖动力度，击球。",
    "view.seat": "座位", "view.top": "俯视", brains: "大脑",
    "brains.title": "让果蝇的连接组在候选击球中选择",
    caption: "把指针移到台面上瞄准，设定力度，然后点击台面或按「击球」。开球后第一个进的球决定各自的球组；己方球未清完就打进 8 号则输。母球落袋或先碰到错误的球会犯规，母球交给对方放在开球点。果蝇用你看到的同一个模拟为每个可击的球试每个袋口，保留没有被挡的击法；开启「大脑」后，它的蘑菇体在最好的三个中选择，并从台面的结果中学习。",
    "brain.note": "一个实时运行的{tier}大脑副本，属于对面的果蝇。它在最佳击球中选择，并从进球结果中学习。",
  },
  az: {
    "lobby.title": "Topları düzün",
    "lobby.body": "Salunda balaca masada səkkiz top oyunu, papaqlı bir milçəyə qarşı. Tam və zolaqlı toplar, səkkiz ən sonda. Milçək və mebel bir dəfə, təxminən 4 MB yüklənir.",
    "lobby.sit": "Təbaşirlə",
    you: "Siz", "turn.you": "Sizin vuruşunuz", "turn.fly": "{name} nişan alır", rolling: "Toplar gedir",
    open: "Masa açıqdır", solids: "Tam toplar", stripes: "Zolaqlılar", left: "{n} qalıb",
    power: "Güc", shoot: "Vur", new: "Yenidən düz",
    "last.potted": "Düşdü. Yenidən vurun.", "last.scratch": "Ağ top düşdü: rəqib onu baş nöqtəyə qoyur.", "last.foul": "Qayda pozuntusu: əvvəl səhv topa dəydi.", "last.miss": "Heç nə düşmədi.",
    youWin: "Bu partiyanı siz udunuz.", flyWins: "Bu partiyanı {name} uddu.",
    aim: "Ağ topun gedəcəyi yerə yönəlin, gücü çəkin, vurun.",
    "view.seat": "Oturacaq", "view.top": "Yuxarıdan", brains: "Beyinlər",
    "brains.title": "Namizəd vuruşlar arasında seçimi milçəyin konnektomuna verin",
    caption: "Nişan almaq üçün göstəricini masanın üstündə gəzdirin, gücü seçin, sonra masaya toxunun və ya Vur düyməsini basın. Qruplar açılışdan sonra düşən ilk topla təyin olunur; qrupunuz bitməmiş səkkizi salsanız uduzursunuz. Ağ topun düşməsi və ya əvvəl səhv topa dəymək ağ topu baş nöqtədə rəqibə verir. Milçək gördüyünüz eyni simulyasiyada vura biləcəyi hər top üçün hər cibi sınayır, maneəsiz vuruşları saxlayır və Beyinlər açıq olduqda göbələk cismi ən yaxşı üçdən birini seçib masanın cavabından öyrənir.",
    "brain.note": "{tier} beynin bir canlı nüsxəsi, masanın o tayındakı milçək üçün. Ən yaxşı vuruşlar arasında seçir və nəyin düşdüyündən öyrənir.",
  },
};
