import type { LocalDict } from "@/lib/i18n";

export type TennisKey =
  | "lobby.title" | "lobby.body" | "lobby.sit" | "you" | "turn.you" | "turn.fly" | "flying" | "serve" | "second" | "games"
  | "pace" | "pace.soft" | "pace.firm" | "pace.hard" | "hit" | "new" | "aim" | "aim.serve"
  | "last.winner" | "last.out" | "last.net" | "last.fault" | "last.double" | "last.point" | "youWin" | "flyWins"
  | "view.seat" | "view.top" | "brains" | "brains.title" | "caption" | "brain.note";

export const dict: LocalDict<TennisKey> = {
  en: {
    "lobby.title": "Serve or receive",
    "lobby.body": "A hard court in the garden, at your size, and one fly across the net. Real scoring, first to four games. It loads the fly once, about 3 MB.",
    "lobby.sit": "Take the court",
    you: "You", "turn.you": "Your shot", "turn.fly": "{name} is on it", flying: "In the air",
    serve: "Serve", second: "Second serve", games: "Games {a}–{b}",
    pace: "Pace", "pace.soft": "Soft", "pace.firm": "Firm", "pace.hard": "Hard",
    hit: "Hit", new: "New set",
    aim: "Click a spot on the far side to hit there.", "aim.serve": "Serve into a service box on the far side.",
    "last.winner": "Winner.", "last.out": "Out.", "last.net": "Net.", "last.fault": "Fault.", "last.double": "Double fault.", "last.point": "Point.",
    youWin: "You take the set, {a}–{b}.", flyWins: "{name} takes the set, {b}–{a}.",
    "view.seat": "Seat", "view.top": "Above", brains: "Brains",
    "brains.title": "Let the fly's connectome choose between its shots",
    caption: "Point at the far half and click where the ball should land; choose a pace first. The ball really flies: gravity, the net, a bounce. Harder balls and balls you had to run for leave the line more, so they find the net or the tramlines more often. Whoever cannot reach the top of the bounce in time has lost the point. Serves must land in the diagonal box; a fault gives a second serve. The fly weighs a few targets a coach would name, the open court, behind you, a drop, the middle, and with Brains on its mushroom body chooses among the best three and learns from the point.",
    "brain.note": "One live copy of the {tier} brain, for the fly across the net. It picks between its shots and learns from the point.",
  },
  zh: {
    "lobby.title": "发球或接发",
    "lobby.body": "花园里一片按你的尺寸建的硬地球场，网对面是一只果蝇。真实计分，先赢四局者胜。首次加载果蝇约 3 MB。",
    "lobby.sit": "上场",
    you: "你", "turn.you": "该你击球", "turn.fly": "{name} 在跑动", flying: "球在飞",
    serve: "发球", second: "第二发", games: "局数 {a}–{b}",
    pace: "力度", "pace.soft": "轻", "pace.firm": "中", "pace.hard": "重",
    hit: "击球", new: "新一盘",
    aim: "点击对面场地的一点，把球打到那里。", "aim.serve": "把球发进对面的发球区。",
    "last.winner": "制胜分。", "last.out": "出界。", "last.net": "下网。", "last.fault": "发球失误。", "last.double": "双误。", "last.point": "得分。",
    youWin: "你拿下这一盘，{a}–{b}。", flyWins: "{name} 拿下这一盘，{b}–{a}。",
    "view.seat": "座位", "view.top": "俯视", brains: "大脑",
    "brains.title": "让果蝇的连接组在候选击球中选择",
    caption: "把指针移到果蝇那半场并点击球的落点；先选力度。打得越重，落点离你要的位置越远，跑动救球后的回球也是如此。如果对方跑不到落点，就是制胜分。发球必须进发球区；失误后有第二发。果蝇权衡教练会点名的几个目标：空档、你身后、放小球、中路；开启「大脑」后，它的蘑菇体在最好的三个中选择，并从这一分中学习。",
    "brain.note": "一个实时运行的{tier}大脑副本，属于网对面的果蝇。它在自己的击球中选择，并从每一分中学习。",
  },
  az: {
    "lobby.title": "Serv və ya qəbul",
    "lobby.body": "Bağda, sizin ölçünüzdə sərt kort və torun o tayında bir milçək. Əsl hesab, dörd oyunu ilk qazanan udur. Milçək bir dəfə, təxminən 3 MB yüklənir.",
    "lobby.sit": "Korta çıx",
    you: "Siz", "turn.you": "Sizin zərbəniz", "turn.fly": "{name} çatır", flying: "Havadadır",
    serve: "Serv", second: "İkinci serv", games: "Oyunlar {a}–{b}",
    pace: "Sürət", "pace.soft": "Yumşaq", "pace.firm": "Orta", "pace.hard": "Sərt",
    hit: "Vur", new: "Yeni set",
    aim: "Topun düşməsi üçün o tərəfdə bir nöqtəyə toxunun.", "aim.serve": "Servi o tərəfdəki serv qutusuna atın.",
    "last.winner": "Vinner.", "last.out": "Aut.", "last.net": "Tor.", "last.fault": "Səhv serv.", "last.double": "İkiqat səhv.", "last.point": "Xal.",
    youWin: "Seti siz aldınız, {a}–{b}.", flyWins: "Seti {name} aldı, {b}–{a}.",
    "view.seat": "Oturacaq", "view.top": "Yuxarıdan", brains: "Beyinlər",
    "brains.title": "Zərbələr arasında seçimi milçəyin konnektomuna verin",
    caption: "Göstəricini milçəyin yarısında gəzdirin və topun düşəcəyi yerə toxunun; əvvəl sürət seçin. Sərt toplar istədiyiniz yerdən daha uzağa düşür, qaçaraq çatdığınız toplar da. Qarşı tərəf sıçrayışa vaxtında çatmasa, bu vinnerdir. Servlər serv qutusuna düşməlidir; səhvdən sonra ikinci serv olur. Milçək məşqçinin adlandıracağı bir neçə hədəfi ölçür, açıq kort, arxanız, qısa top, orta, və Beyinlər açıq olduqda göbələk cismi ən yaxşı üçdən birini seçib xaldan öyrənir.",
    "brain.note": "{tier} beynin bir canlı nüsxəsi, torun o tayındakı milçək üçün. Zərbələri arasında seçir və xaldan öyrənir.",
  },
};
