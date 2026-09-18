import type { LocalDict } from "@/lib/i18n";

export type XiangqiKey =
  | "lobby.title" | "lobby.body" | "lobby.sit"
  | "red" | "black" | "you" | "turn.you" | "turn.fly" | "check" | "checkmate" | "stalemate" | "youWin" | "flyWins"
  | "new" | "view.seat" | "view.top" | "brains" | "brains.title" | "moves"
  | "caption" | "brain.note";

export const dict: LocalDict<XiangqiKey> = {
  en: {
    "lobby.title": "Take the red side",
    "lobby.body": "Xiangqi on the tea table, with the public-domain board and pieces from Wikimedia Commons. The fly across from you plays black. It loads the fly and the furniture once, about 3 MB.",
    "lobby.sit": "Sit down",
    red: "Red", black: "Black", you: "You",
    "turn.you": "Your move", "turn.fly": "{name} is thinking",
    check: "Check", checkmate: "Checkmate", stalemate: "No moves",
    youWin: "You win. {name} resigns.", flyWins: "{name} wins.",
    new: "New game", "view.seat": "Seat", "view.top": "Above", brains: "Brains",
    "brains.title": "Let the fly's connectome choose between the candidate moves",
    moves: "Moves",
    caption: "Full rules: the river, the palace, the elephants that cannot cross, the cannon that captures by jumping, and the generals that may not face each other. Click or tap a piece, then a point. With Brains on, the fly's mushroom body chooses between the search's best moves and learns from how they rank.",
    "brain.note": "One live copy of the {tier} brain, for the fly across the table. It picks between the search's best moves and learns from how they rank.",
  },
  zh: {
    "lobby.title": "执红入座",
    "lobby.body": "茶桌上的象棋，棋盘与棋子来自维基共享资源的公有领域文件。对面的果蝇执黑。首次加载果蝇和家具约 3 MB。",
    "lobby.sit": "坐下",
    red: "红方", black: "黑方", you: "你",
    "turn.you": "轮到你走", "turn.fly": "{name} 在思考",
    check: "将军", checkmate: "将死", stalemate: "无子可动",
    youWin: "你赢了，{name} 认输。", flyWins: "{name} 获胜。",
    new: "新对局", "view.seat": "座位", "view.top": "俯视", brains: "大脑",
    "brains.title": "让果蝇的连接组在候选着法中选择",
    moves: "着法",
    caption: "完整规则：楚河汉界、九宫、象不过河、炮隔子吃、将帅不能照面。点击或点按一个棋子，再点击落点。开启「大脑」后，果蝇的蘑菇体在搜索给出的最佳着法中选择，并从它们的排名中学习。",
    "brain.note": "一个实时运行的{tier}大脑副本，属于对面的果蝇。它在搜索给出的最佳着法中选择，并从排名中学习。",
  },
  az: {
    "lobby.title": "Qırmızı tərəfi götürün",
    "lobby.body": "Çay masasında syanqi; lövhə və daşlar Wikimedia Commons-un ictimai mülkiyyət fayllarındandır. Qarşınızdakı milçək qara ilə oynayır. Milçək və mebel bir dəfə, təxminən 3 MB yüklənir.",
    "lobby.sit": "Otur",
    red: "Qırmızı", black: "Qara", you: "Siz",
    "turn.you": "Sizin gedişiniz", "turn.fly": "{name} düşünür",
    check: "Şah", checkmate: "Mat", stalemate: "Gediş yoxdur",
    youWin: "Siz qalib gəldiniz. {name} təslim olur.", flyWins: "{name} qalib gəlir.",
    new: "Yeni oyun", "view.seat": "Oturacaq", "view.top": "Yuxarıdan", brains: "Beyinlər",
    "brains.title": "Namizəd gedişlər arasında seçimi milçəyin konnektomuna verin",
    moves: "Gedişlər",
    caption: "Tam qaydalar: çay, saray, çayı keçə bilməyən fillər, tullanaraq vuran top və üz-üzə dura bilməyən generallar. Daşa, sonra nöqtəyə klikləyin və ya toxunun. Beyinlər açıq olduqda milçəyin göbələk cismi axtarışın ən yaxşı gedişləri arasında seçir və sıralarından öyrənir.",
    "brain.note": "Qarşıdakı milçək üçün {tier} beynin bir canlı nüsxəsi. Axtarışın ən yaxşı gedişləri arasında seçir və onların sırasından öyrənir.",
  },
};
