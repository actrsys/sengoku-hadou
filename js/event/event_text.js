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
                if (item.leftFace) opts.leftFace = item.leftFace;
                if (item.rightName) opts.rightName = item.rightName;
                if (item.rightFace) opts.rightFace = item.rightFace;
                
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
                msg: `今川義元の死後、三河で独立を果たした${args.motoyasuName}は、\n隣国${args.imagawaClanName}と敵対関係となっていた。`
            },
            {
                type: 'log',
                msg: `${args.motoyasuName}は隣国を統一した${args.nobunagaName}との接近を考え、\n${args.odaClanName}との同盟を模索していた。`
            },
            {
                type: 'dialog',
                rightName: args.vassalName,  // 武将は右側から話しかけます
                rightFace: args.vassalFace,
                msg: `「殿、${args.odaClanName}と手を結ぶは必定なれど、${args.nobunagaGivenName}は油断ならぬ男。\nやすやすとうまくはいきますまい。」`
            },
            {
                type: 'dialog',
                leftName: args.motoyasuName,  // 家康（元康）は常に左側です
                leftFace: args.motoyasuFace,
                msg: `「うむ。それゆえ、此度はわしみずから、\n${args.nobunagaCastleName}に赴こうと考えておる。\nかのお方とは腹を割って話さねばならぬのだ。」`
            },
            {
                type: 'dialog',
                rightName: args.vassalName,
                rightFace: args.vassalFace,
                msg: `「殿自ら……？\nしかし、それは危険にございます。」`
            },
            {
                type: 'dialog',
                leftName: args.motoyasuName,
                leftFace: args.motoyasuFace,
                msg: `「わし自ら訪問することで、当方の誠意と覚悟を見せるのだ。\n最早決めたことじゃ。もう何も言うでない。」`
            },
            {
                type: 'dialog',
                rightName: args.vassalName,
                rightFace: args.vassalFace,
                msg: `「はっ……」`
            },
            {
                type: 'log',
                msg: `${args.year}年${args.month}月　${args.nobunagaCastleName}`
            },
            {
                type: 'dialog',
                rightName: args.nobunagaName,  // 信長は右側に登場します
                rightFace: args.nobunagaFace,
                msg: `「よう来たのう、竹千代。\n久しいのう。よう来てくれた。」`
            },
            {
                type: 'dialog',
                leftName: args.motoyasuName,
                leftFace: args.motoyasuFace,
                msg: `「お懐かしゅうございまする、吉法師様。\nいえ、${args.nobunagaTitle}様。」`
            },
            {
                type: 'dialog',
                rightName: args.nobunagaName,
                rightFace: args.nobunagaFace,
                msg: `「わしとそなたの仲ではないか。吉法師で構わぬわい。」`
            },
            {
                type: 'dialog',
                leftName: args.motoyasuName,
                leftFace: args.motoyasuFace,
                msg: `「はっ、吉法師様。\n此度は${args.matsudairaClanName}と${args.odaClanName}の同盟の件で参りました。」`
            },
            {
                type: 'dialog',
                rightName: args.nobunagaName,
                rightFace: args.nobunagaFace,
                msg: `「応とも。\nわしと竹千代が組めば、怖いものはないわい。\nはっはっはっ……」`
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