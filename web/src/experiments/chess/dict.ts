import type { LocalDict } from "@/lib/i18n";

export type ChessKey =
  | "lobby.title" | "lobby.body" | "lobby.sit"
  | "white" | "black" | "you" | "turn.you" | "turn.fly" | "check" | "checkmate" | "stalemate" | "draw" | "youWin" | "flyWins"
  | "new" | "view.seat" | "view.top" | "brains" | "brains.title" | "promote" | "moves"
  | "piece.queen" | "piece.rook" | "piece.bishop" | "piece.knight"
  | "caption" | "brain.note";

export const dict: LocalDict<ChessKey> = {
  en: {
    "lobby.title": "Take the white pieces",
    "lobby.body": "A Poly Haven chess set on the tea table, and one fly on the stool across from you, playing black. It loads the set and the fly once, about 3 MB.",
    "lobby.sit": "Sit down",
    white: "White", black: "Black", you: "You",
    "turn.you": "Your move", "turn.fly": "{name} is thinking",
    check: "Check", checkmate: "Checkmate", stalemate: "Stalemate", draw: "Draw",
    youWin: "You win. {name} resigns.", flyWins: "{name} wins.",
    new: "New game", "view.seat": "Seat", "view.top": "Above", brains: "Brains",
    "brains.title": "Let the fly's connectome choose between the candidate moves",
    promote: "Promote to", moves: "Moves",
    "piece.queen": "Queen", "piece.rook": "Rook", "piece.bishop": "Bishop", "piece.knight": "Knight",
    caption: "Click or tap a piece, then a square. The fly plays from a three-ply search; with Brains on, its mushroom body looks at the top candidates and plays the one it likes most, then is rewarded when that was the best of them and punished when it was the worst.",
    "brain.note": "One live copy of the {tier} brain, for the fly across the table. It picks between the search's best moves and learns from how they rank.",
  },
  zh: {
    "lobby.title": "执白入座",
    "lobby.body": "茶桌上的 Poly Haven 国际象棋，对面凳子上坐着一只执黑的果蝇。首次加载棋具和果蝇约 3 MB。",
    "lobby.sit": "坐下",
    white: "白方", black: "黑方", you: "你",
    "turn.you": "轮到你走", "turn.fly": "{name} 在思考",
    check: "将军", checkmate: "将死", stalemate: "逼和", draw: "和棋",
    youWin: "你赢了，{name} 认输。", flyWins: "{name} 获胜。",
    new: "新对局", "view.seat": "座位", "view.top": "俯视", brains: "大脑",
    "brains.title": "让果蝇的连接组在候选着法中选择",
    promote: "升变为", moves: "着法",
    "piece.queen": "后", "piece.rook": "车", "piece.bishop": "象", "piece.knight": "马",
    caption: "点击或点按一个棋子，再点击目标格。果蝇按三层搜索走棋；开启「大脑」后，它的蘑菇体会观察最佳候选着法并走它最喜欢的那步，走到最优则获得奖励，走到最差则受到惩罚。",
    "brain.note": "一个实时运行的{tier}大脑副本，属于对面的果蝇。它在搜索给出的最佳着法中选择，并从它们的排名中学习。",
  },
  az: {
    "lobby.title": "Ağ daşlarla oturun",
    "lobby.body": "Çay masasında Poly Haven şahmat dəsti və qarşınızdakı kətildə qara ilə oynayan bir milçək. Dəst və milçək bir dəfə, təxminən 3 MB yüklənir.",
    "lobby.sit": "Otur",
    white: "Ağ", black: "Qara", you: "Siz",
    "turn.you": "Sizin gedişiniz", "turn.fly": "{name} düşünür",
    check: "Şah", checkmate: "Mat", stalemate: "Pat", draw: "Heç-heçə",
    youWin: "Siz qalib gəldiniz. {name} təslim olur.", flyWins: "{name} qalib gəlir.",
    new: "Yeni oyun", "view.seat": "Oturacaq", "view.top": "Yuxarıdan", brains: "Beyinlər",
    "brains.title": "Namizəd gedişlər arasında seçimi milçəyin konnektomuna verin",
    promote: "Çevir", moves: "Gedişlər",
    "piece.queen": "Vəzir", "piece.rook": "Top", "piece.bishop": "Fil", "piece.knight": "At",
    caption: "Daşa, sonra xanaya klikləyin və ya toxunun. Milçək üç gedişlik axtarışla oynayır; Beyinlər açıq olduqda göbələk cismi ən yaxşı namizədlərə baxır və ən çox bəyəndiyini oynayır, ən yaxşısı olduqda mükafat, ən pisi olduqda cəza alır.",
    "brain.note": "Qarşıdakı milçək üçün {tier} beynin bir canlı nüsxəsi. Axtarışın ən yaxşı gedişləri arasında seçir və onların sırasından öyrənir.",
  },
};
