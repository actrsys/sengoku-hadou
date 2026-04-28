/**
 * event_text.js
 * イベントの文章や会話の台本をまとめて管理するファイルです。
 */

window.EventTextManager = {
    // ==========================================
    // ★ 共通のテキスト再生プレイヤー
    // ==========================================
    playSequence: async function(game, sequence) {
        // 受け取った台本（sequence）を上から順番に再生します
        for (const item of sequence) {
            if (item.type === 'log') {
                // 顔画像のない、ただのメッセージとして表示します
                await game.ui.showDialogAsync(item.msg, false, 0);
            } else if (item.type === 'dialog') {
                // 顔画像や名前をつけて、会話として表示します
                const opts = {};
                
                if (item.leftName) opts.leftName = item.leftName;
                // もし顔が指定されていればそれを使用し、指定がなくて名前が「小姓」なら自動でセットします
                if (item.leftFace) {
                    opts.leftFace = item.leftFace;
                } else if (item.leftName === '小姓') {
                    opts.leftFace = 'koshou.webp';
                }
                
                if (item.rightName) opts.rightName = item.rightName;
                // 右側も同じように自動でセットする仕組みです
                if (item.rightFace) {
                    opts.rightFace = item.rightFace;
                } else if (item.rightName === '小姓') {
                    opts.rightFace = 'koshou.webp';
                }
                
                await game.ui.showDialogAsync(item.msg, false, 0, opts);
            }
        }
    },

    // ==========================================
    // ★ イベントごとの台本置き場
    // ==========================================
    
    // ① 清州同盟
    kiyosu_alliance: function(args) {
        // args（引数）として、その時の武将の名前や勢力名を受け取り、文章に埋め込みます
        return [
            {
                type: 'log',
                msg: `今川義元の死後、三河で独立を果たした${args.motoyasuName}は、隣国${args.imagawaClanName}と敵対関係となっていた。`
            },
            {
                type: 'log',
                msg: `${args.motoyasuName}は${args.nobunagaName}との接近を考え、${args.odaClanName}との同盟を模索していた。`
            },
            {
                type: 'dialog',
                leftName: args.vassalName,
                leftFace: args.vassalFace,
                msg: `「殿、${args.odaClanName}と手を結ぶは必定なれど、${args.nobunagaGivenName}は油断ならぬ男。やすやすとうまくはいきますまい。」`
            },
            {
                type: 'dialog',
                leftName: args.motoyasuName,
                leftFace: args.motoyasuFace,
                msg: `「うむ。それゆえ、此度はわしみずから、${args.nobunagaCastleName}に赴こうと考えておる。かのお方とは腹を割って話さねばならぬのだ。」`
            },
            {
                type: 'dialog',
                leftName: args.vassalName,
                leftFace: args.vassalFace,
                msg: `「殿自ら……？\nしかし、それは危険にございます。」`
            },
            {
                type: 'dialog',
                leftName: args.motoyasuName,
                leftFace: args.motoyasuFace,
                msg: `「わし自ら訪問することで、当方の誠意と覚悟を見せるのだ。最早決めたことじゃ。もう何も言うでない。」`
            },
            {
                type: 'dialog',
                leftName: args.vassalName,
                leftFace: args.vassalFace,
                msg: `「はっ……」`
            },
            {
                type: 'log',
                msg: `${args.year}年${args.month}月　${args.nobunagaCastleName}`
            },
            {
                type: 'dialog',
                leftName: args.nobunagaName,
                leftFace: args.nobunagaFace,
                msg: `「よう来たのう、竹千代。久しいのう。よう来てくれた。」`
            },
            {
                type: 'dialog',
                leftName: args.motoyasuName,
                leftFace: args.motoyasuFace,
                msg: `「お懐かしゅうございまする、吉法師様。いえ、${args.nobunagaTitle}様。」`
            },
            {
                type: 'dialog',
                leftName: args.nobunagaName,
                leftFace: args.nobunagaFace,
                msg: `「わしとそなたの仲ではないか。吉法師で構わぬわい。」`
            },
            {
                type: 'dialog',
                leftName: args.motoyasuName,
                leftFace: args.motoyasuFace,
                msg: `「はっ、吉法師様。まこと、懐かしゅうござりまする。」`
            },
            {
                type: 'dialog',
                leftName: args.nobunagaName,
                leftFace: args.nobunagaFace,
                msg: `「うむ……\nして、同盟の話であろう？」`
            },
            {
                type: 'dialog',
                leftName: args.motoyasuName,
                leftFace: args.motoyasuFace,
                msg: `「ご明察にござる。此度は${args.matsudairaClanName}と${args.odaClanName}の同盟の件で参りました。」`
            },
            {
                type: 'dialog',
                leftName: args.nobunagaName,
                leftFace: args.nobunagaFace,
                msg: `「うむ、わかっておる。わしと竹千代が組めば、怖いものはないわい。はっはっはっ……」`
            },
            {
                type: 'dialog',
                leftName: args.motoyasuName,
                leftFace: args.motoyasuFace,
                msg: `「はっはっはっ……」`
            },
            {
                type: 'log',
                msg: `こうして、${args.matsudairaClanName}と${args.odaClanName}の同盟は成立した。`
            }
        ];
    }
};