import type { LocalDict } from "@/lib/i18n";

export type PokerKey =
  | "lobby.title" | "lobby.body" | "lobby.sit"
  | "you" | "chips" | "pot" | "toCall" | "turn.you" | "turn.fly" | "hand" | "phase.preflop" | "phase.flop" | "phase.turn" | "phase.river" | "phase.showdown" | "phase.over"
  | "fold" | "check" | "call" | "raise" | "allIn" | "youWin" | "flyWins" | "next" | "new" | "view.seat" | "view.top" | "brains" | "brains.title"
  | "hand.0" | "hand.1" | "hand.2" | "hand.3" | "hand.4" | "hand.5" | "hand.6" | "hand.7" | "hand.8" | "hand.9"
  | "caption" | "brain.note";

export const dict: LocalDict<PokerKey> = {
  en: {
    "lobby.title": "Pull up a stool",
    "lobby.body": "No-limit hold'em at a round saloon table, under the cowboy-town light probe. Three flies in cowboy hats, a CC0 deck from Wikimedia Commons, and a pot. It loads the flies, the saloon and the deck once, about 6 MB.",
    "lobby.sit": "Sit down",
    you: "You", chips: "chips", pot: "Pot", toCall: "to call",
    "turn.you": "Your action", "turn.fly": "{name} is deciding", hand: "Hand {n}",
    "phase.preflop": "Pre-flop", "phase.flop": "Flop", "phase.turn": "Turn", "phase.river": "River", "phase.showdown": "Showdown", "phase.over": "Hand over",
    fold: "Fold", check: "Check", call: "Call {n}", raise: "Raise {n}", allIn: "All in",
    youWin: "You take the pot, {n} chips.", flyWins: "{name} takes the pot, {n} chips.",
    next: "Next hand", new: "New game", "view.seat": "Seat", "view.top": "Above", brains: "Brains",
    "brains.title": "Let each fly's connectome make the call",
    "hand.0": "High card", "hand.1": "Pair", "hand.2": "Two pair", "hand.3": "Three of a kind", "hand.4": "Straight", "hand.5": "Flush", "hand.6": "Full house", "hand.7": "Four of a kind", "hand.8": "Straight flush", "hand.9": "Royal flush",
    caption: "Fold, check or call, or raise by a quarter, half or all of your stack. Each fly rates its hand against the board and proposes fold, call or raise; with Brains on, its mushroom body makes the call, and at showdown the winner's choices are rewarded and the losers' punished.",
    "brain.note": "Three live copies of the {tier} brain. Each fly's connectome decides its action and learns from the chips it wins and loses.",
  },
  zh: {
    "lobby.title": "拉把凳子坐下",
    "lobby.body": "牛仔镇酒馆光照下的圆桌无限注德州扑克。三只戴牛仔帽的果蝇、一副来自维基共享资源的 CC0 扑克牌，还有一个底池。首次加载果蝇、酒馆和牌约 6 MB。",
    "lobby.sit": "坐下",
    you: "你", chips: "筹码", pot: "底池", toCall: "需跟注",
    "turn.you": "轮到你行动", "turn.fly": "{name} 在决定", hand: "第 {n} 手",
    "phase.preflop": "翻牌前", "phase.flop": "翻牌", "phase.turn": "转牌", "phase.river": "河牌", "phase.showdown": "摊牌", "phase.over": "本手结束",
    fold: "弃牌", check: "过牌", call: "跟注 {n}", raise: "加注 {n}", allIn: "全下",
    youWin: "你赢下底池，{n} 筹码。", flyWins: "{name} 赢下底池，{n} 筹码。",
    next: "下一手", new: "重新开始", "view.seat": "座位", "view.top": "俯视", brains: "大脑",
    "brains.title": "让每只果蝇的连接组做决定",
    "hand.0": "高牌", "hand.1": "一对", "hand.2": "两对", "hand.3": "三条", "hand.4": "顺子", "hand.5": "同花", "hand.6": "葫芦", "hand.7": "四条", "hand.8": "同花顺", "hand.9": "皇家同花顺",
    caption: "弃牌、过牌或跟注，或按四分之一、一半或全部筹码加注。每只果蝇根据公共牌评估自己的手牌并提议弃牌、跟注或加注；开启「大脑」后由蘑菇体做决定，摊牌时赢家的选择获得奖励，输家的受到惩罚。",
    "brain.note": "三个实时运行的{tier}大脑副本。每只果蝇的连接组决定它的行动，并从赢得和输掉的筹码中学习。",
  },
  az: {
    "lobby.title": "Kətil çəkin",
    "lobby.body": "Kovboy şəhərinin işığı altında dairəvi saloon masasında limitsiz hold'em. Kovboy şlyapalı üç milçək, Wikimedia Commons-dan CC0 kart dəsti və bir qazan. Milçəklər, saloon və dəst bir dəfə, təxminən 6 MB yüklənir.",
    "lobby.sit": "Otur",
    you: "Siz", chips: "fiş", pot: "Qazan", toCall: "çağırmağa",
    "turn.you": "Sizin gedişiniz", "turn.fly": "{name} qərar verir", hand: "Əl {n}",
    "phase.preflop": "Flopdan əvvəl", "phase.flop": "Flop", "phase.turn": "Törn", "phase.river": "River", "phase.showdown": "Açılış", "phase.over": "Əl bitdi",
    fold: "At", check: "Keç", call: "Çağır {n}", raise: "Qaldır {n}", allIn: "Hamısı",
    youWin: "Qazan sizindir, {n} fiş.", flyWins: "{name} qazanı götürür, {n} fiş.",
    next: "Növbəti əl", new: "Yeni oyun", "view.seat": "Oturacaq", "view.top": "Yuxarıdan", brains: "Beyinlər",
    "brains.title": "Qərarı hər milçəyin konnektomuna verin",
    "hand.0": "Yüksək kart", "hand.1": "Cüt", "hand.2": "İki cüt", "hand.3": "Üçlük", "hand.4": "Strit", "hand.5": "Flaş", "hand.6": "Ful-haus", "hand.7": "Dördlük", "hand.8": "Strit-flaş", "hand.9": "Royal-flaş",
    caption: "Atın, keçin və ya çağırın, ya da fişlərinizin dörddə biri, yarısı və ya hamısı ilə qaldırın. Hər milçək əlini lövhəyə görə qiymətləndirir və at, çağır və ya qaldır təklif edir; Beyinlər açıq olduqda qərarı göbələk cismi verir, açılışda qalibin seçimləri mükafatlandırılır, uduzanlarınkı cəzalandırılır.",
    "brain.note": "{tier} beynin üç canlı nüsxəsi. Hər milçəyin konnektomu öz gedişinə qərar verir və qazandığı-itirdiyi fişlərdən öyrənir.",
  },
};
