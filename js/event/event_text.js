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
                msg: `「うむ。それゆえ、此度はわし自ら、${args.nobunagaCastleName}に赴こうと考えておる。かのお方とは腹を割って話さねばならぬのだ。」`
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
    },
    
    //桶狭間の戦い
    okehazama_part1: function(args) {
        return [
            { type: 'log', msg: `覇を競う群雄の中にあって、東海に一際大きな影があった。` },
            { type: 'log', msg: `${args.yoshimotoName}。\n駿河・遠江・三河を従え、海道一の弓取りと名高い大大名である。` },
            { type: 'log', msg: `三河を平定した${args.yoshimotoName}はさらに支配地域を拡大するべく、大軍を率いて${args.sunpuCastleName}より出陣。${args.owariProvinceName}への侵攻を開始した。` },
            { type: 'log', msg: `一方、${args.yoshimotoGivenName}出陣の報を受け、${args.owariProvinceName}・${args.nobunagaFamilyName}家では重臣らが一同に介し、軍議を行っていた。` },
            { type: 'dialog', leftName: args.juushinAName, leftFace: args.juushinAFace, msg: `「${args.nobunagaGivenName}様、${args.yoshimotoFamilyName}軍は総勢二万五千の大軍でござる。かくなる上は、降伏するしかありませぬ。」` },
            { type: 'dialog', leftName: args.juushinBName, leftFace: args.juushinBFace, msg: `「馬鹿なことを申すな！\n一戦交えずして降伏など武士の名折れにござる。」` },
            { type: 'dialog', leftName: args.juushinBName, leftFace: args.juushinBFace, msg: `「${args.nobunagaGivenName}様、ここは籠城して援軍を待つべきかと。」` },
            { type: 'dialog', leftName: args.shinzanCName, leftFace: args.shinzanCFace, msg: `「何を悠長なことを……殿、ここは一か八か打って出るべきしかありませぬ！\n引き籠っていては、勝機は開けませぬぞ！」` }
        ];
    },
    okehazama_attack: function(args) {
        return [
            { type: 'dialog', leftName: args.nobunagaName, leftFace: args.nobunagaFace, msg: `「誰ぞ、鼓をもて！」` },
            { type: 'dialog', leftName: "小姓", leftFace: "koshou.webp", msg: `「はっ！」` },
            { type: 'log', msg: `${args.nobunagaGivenName}は小姓の鼓の音に合わせて舞いはじめた。` },
            { type: 'dialog', leftName: args.nobunagaName, leftFace: args.nobunagaFace, msg: `「人間五十年、下天の内をくらぶれば、夢幻のごとくなり。一度生を得て、滅せぬ者のあるべきか……」` },
            { type: 'dialog', leftName: args.nobunagaName, leftFace: args.nobunagaFace, msg: `「出陣じゃ、具足をもて。」` },
            { type: 'dialog', leftName: args.shinzanCName, leftFace: args.shinzanCFace, msg: `「はっ、お供いたしまする！」` },
            { type: 'dialog', leftName: args.juushinBName, leftFace: args.juushinBFace, msg: `「ははっ！」` },
            { type: 'log', msg: `国境での迎撃を採用した${args.nobunagaGivenName}は、軍勢を率いて出陣した。` },
            { type: 'log', msg: `その頃、${args.yoshimotoFamilyName}軍が${args.nobunagaFamilyName}方の丸根砦、鷲津城を陥落せしめたとの知らせが${args.nobunagaGivenName}に届く。` },
            { type: 'log', msg: `${args.nobunagaGivenName}は善照寺に入り、およそ三千の軍勢を整え、迂回して出撃。進軍を開始した。` },
            { type: 'dialog', leftName: args.shinzanDName, leftFace: args.shinzanDFace, msg: `「殿、${args.yoshimotoName}本隊は、桶狭間山にて軍を休めておりまする！」` },
            { type: 'log', msg: `その時、にわかに雨が降り出した。たちまち黒雲が戦場を覆い、雷鳴が轟いた。視界を妨げる程の豪雨であった。` },
            { type: 'dialog', leftName: args.nobunagaName, leftFace: args.nobunagaFace, msg: `「見よ！　天も我に味方しておるわ！\n此度の戦、勝ったも同然よ！」` },
            { type: 'dialog', leftName: args.nobunagaName, leftFace: args.nobunagaFace, msg: `「今じゃ！　全軍、一丸となって突っ込め！」` },
            { type: 'dialog', leftName: args.shinzanCName, leftFace: args.shinzanCFace, msg: `「おおお－っ！！」` },
            { type: 'log', msg: `${args.nobunagaFamilyName}軍は豪雨に乗じて兵を進め、${args.yoshimotoName}の本隊に奇襲をかけた。勢いを得た${args.nobunagaFamilyName}軍は、とうとう${args.yoshimotoGivenName}を追い詰めた。` },
            { type: 'log', msg: `${args.yoshimotoName}は自らも奮戦したが、${args.nobunagaFamilyName}軍の猛攻により、次々と兵は討ち取られていった。` },
            { type: 'dialog', leftName: args.yoshimotoName, leftFace: args.yoshimotoFace, msg: `「まさか、かようなところでこのわしが……\n天が、${args.nobunagaGivenName}に味方したというのか……」` },
            { type: 'dialog', leftName: args.yoshimotoName, leftFace: args.yoshimotoFace, msg: `「ぐふっ……」` },
            { type: 'dialog', leftName: args.mouriName, leftFace: args.mouriFace, msg: `「${args.yoshimotoName}、${args.mouriName}が討ち取ったり！」` },
            { type: 'log', msg: `こうして、海道一の弓取りとうたわれた${args.yoshimotoName}は${args.owariProvinceShort}の地でその生涯を終えた。` },
            { type: 'log', msg: `${args.owariProvinceShort}のうつけが${args.yoshimotoName}を討ち取ったとの知らせはまたたく間に広まり、${args.nobunagaGivenName}は一躍その名を全国に轟かせることとなった。` }
        ];
    },
    okehazama_defend: function(args) {
        return [
            { type: 'dialog', leftName: args.nobunagaName, leftFace: args.nobunagaFace, msg: `「籠城じゃ。打って出るべきではないわ。」` },
            { type: 'dialog', leftName: args.juushinAName, leftFace: args.juushinAFace, msg: `「はっ、承知いたしました！」` },
            { type: 'dialog', leftName: args.shinzanCName, leftFace: args.shinzanCFace, msg: `「むむむ……」` }
        ];
    }
    
};