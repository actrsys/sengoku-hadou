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
                await game.ui.showDialogAsync(item.msg, false, 0, { isEvent: true });
            } else if (item.type === 'dialog') {
                // 顔画像や名前をつけて、会話として表示します
                const opts = { isEvent: true };
                
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
    // ① 清洲同盟（パート１：使者の到着まで）
    kiyosu_alliance_part1: function(args) {
        return [
            { type: 'log', msg: `今川義元の死後、三河で独立を果たした${args.motoyasuName}は、隣国${args.imagawaFamilyName}家と敵対関係となっていた。` },
            { type: 'log', msg: `${args.motoyasuGivenName}は長年に渡り敵対関係にあった${args.odaFamilyName}家との同盟を模索していた。` },
            { type: 'dialog', leftName: args.kashinAName, leftFace: args.kashinAFace, msg: `「殿、なりませぬぞ。」` },
            { type: 'dialog', leftName: args.kashinAName, leftFace: args.kashinAFace, msg: `「${args.odaFamilyName}と我らは、先々代の清孝公の時代より敵対してまいりました。今さら同盟などと、納得できぬ者も多いでしょう。」` },
            { type: 'dialog', leftName: args.kashinBName, leftFace: args.kashinBFace, msg: `「そうは申すが、人質を出さぬと決めた以上、${args.imagawaFamilyName}とはもはやこれまで。一触即発の関係にござる。」` },
            { type: 'dialog', leftName: args.kashinBName, leftFace: args.kashinBFace, msg: `「その上、三河の掌握もままならぬとなれば、${args.odaFamilyName}の力添え無くして我らの生き残る道はありますまい。」` },
            { type: 'dialog', leftName: args.motoyasuName, leftFace: args.motoyasuFace, msg: `「うむ……${args.kashinAGivenName}よ、おぬしの言い分ももっともじゃ。」` },
            { type: 'dialog', leftName: args.motoyasuName, leftFace: args.motoyasuFace, msg: `「しかし、それで${args.odaFamilyName}と結ぶは必定であるとわしは考えておる。」` },
            { type: 'dialog', leftName: args.kashinAName, leftFace: args.kashinAFace, msg: `「は……なれど、${args.nobunagaGivenName}は油断ならぬ男。容易にはいきますまい。」` },
            { type: 'dialog', leftName: args.motoyasuName, leftFace: args.motoyasuFace, msg: `「うむ。此度はわし自ら${args.nobunagaCastleShort}に赴かねばなるまい。」` },
            { type: 'dialog', leftName: args.motoyasuName, leftFace: args.motoyasuFace, msg: `「わし自ら訪問することで、当方の誠意と覚悟を見せるのじゃ。よいな。」` },
            { type: 'dialog', leftName: args.kashinAName, leftFace: args.kashinAFace, msg: `「ははっ！」` },
            { type: 'log', msg: `${args.year}年${args.month}月　${args.nobunagaCastleName}` }
        ];
    },

    // ① 清洲同盟（織田家専用：使者の取り次ぎ）
    kiyosu_alliance_oda_arrival: function(args) {
        return [
            { type: 'dialog', leftName: args.shinzanCName, leftFace: args.shinzanCFace, msg: `「殿。${args.matsudairaFamilyName}家の使者が参っておりまする。」` },
            { type: 'dialog', leftName: args.nobunagaName, leftFace: args.nobunagaFace, msg: `「${args.matsudairaFamilyName}か……ふむ。」` }
        ];
    },

    // ① 清洲同盟（織田家専用：面会決定〜対面）
    kiyosu_alliance_oda_accept: function(args) {
        return [
            { type: 'dialog', leftName: args.nobunagaName, leftFace: args.nobunagaFace, msg: `「ふっ、会うてやろうではないか。通せ。」` },
            { type: 'dialog', leftName: args.shinzanCName, leftFace: args.shinzanCFace, msg: `「はっ！」` },
            { type: 'log', msg: `${args.nobunagaGivenName}と${args.motoyasuGivenName}は、${args.nobunagaCastleName}内で対面した。` }
        ];
    },

    // ① 清洲同盟（パート２：面会して同盟成立ルート）
    kiyosu_alliance_accept: function(args) {
        return [
            { type: 'dialog', leftName: args.nobunagaName, leftFace: args.nobunagaFace, msg: `「おぬし自ら来るとはのう。よう来た、竹千代。」` },
            { type: 'dialog', leftName: args.motoyasuName, leftFace: args.motoyasuFace, msg: `「お懐かしゅうございまする、吉法師様。いえ、${args.nobunagaTitle}様。」` },
            { type: 'dialog', leftName: args.nobunagaName, leftFace: args.nobunagaFace, msg: `「はっはっは！\nわしとそなたの仲ではないか。吉法師で構わぬわい。」` },
            { type: 'dialog', leftName: args.motoyasuName, leftFace: args.motoyasuFace, msg: `「はっ、吉法師様。まこと、懐かしゅうござりまする。」` },
            { type: 'dialog', leftName: args.nobunagaName, leftFace: args.nobunagaFace, msg: `「うむ、息災で何よりである。」` },
            { type: 'dialog', leftName: args.nobunagaName, leftFace: args.nobunagaFace, msg: `「して……おぬしがここへ来たとなれば、${args.imagawaFamilyName}とは袂を分かつ心づもりであるな？」` },
            { type: 'dialog', leftName: args.motoyasuName, leftFace: args.motoyasuFace, msg: `「はっ、ご明察にござる。${args.matsudairaFamilyName}家が生き残る道はこれしかござらぬ。どうか我らと結んでいただきたく。」` },
            { type: 'dialog', leftName: args.nobunagaName, leftFace: args.nobunagaFace, msg: `「……ふっ、敵地に堂々と乗り込むおぬしの豪胆さには参ったわい。」` },
            { type: 'dialog', leftName: args.nobunagaName, leftFace: args.nobunagaFace, msg: `「あいわかった。今日より我らは盟友じゃ。」` },
            { type: 'dialog', leftName: args.nobunagaName, leftFace: args.nobunagaFace, msg: `「西はわし。東はおぬしじゃ。それで良かろう？」` },
            { type: 'dialog', leftName: args.motoyasuName, leftFace: args.motoyasuFace, msg: `「ははっ！　まこと、うれしゅう存じまする！」` },
            { type: 'dialog', leftName: args.nobunagaName, leftFace: args.nobunagaFace, msg: `「うむ、今日はよい日じゃ。はっはっはっ……」` },
            { type: 'dialog', leftName: args.motoyasuName, leftFace: args.motoyasuFace, msg: `「はっはっはっ……」` },
            { type: 'log', msg: `こうして、${args.odaClanName}と${args.matsudairaClanName}の同盟は成立した。` }
        ];
    },
    // ① 清洲同盟（パート３：追い返すルート）
    kiyosu_alliance_reject: function(args) {
        return [
            { type: 'dialog', leftName: args.nobunagaName, leftFace: args.nobunagaFace, msg: `「追い返せ。」` },
            { type: 'dialog', leftName: args.shinzanCName, leftFace: args.shinzanCFace, msg: `「へ……？　よろしいのですか？」` },
            { type: 'dialog', leftName: args.nobunagaName, leftFace: args.nobunagaFace, msg: `「どうせ我らと結びたいと申すのであろう。構わぬ。追っ払え。」` },
            { type: 'dialog', leftName: args.shinzanCName, leftFace: args.shinzanCFace, msg: `「はっ、ははっ！」` }
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
            { type: 'dialog', leftName: args.shinzanCName, leftFace: args.shinzanCFace, msg: `「何を悠長なことを……殿、ここは一か八か打って出るしかありませぬ！」` },
            { type: 'dialog', leftName: args.shinzanCName, leftFace: args.shinzanCFace, msg: `「引き籠っていては、勝機は開けませぬぞ！」` }
        ];
    },
    okehazama_imagawa_part1: function(args) {
        return [
            { type: 'log', msg: `覇を競う群雄の中にあって、東海に一際大きな影があった。` },
            { type: 'log', msg: `${args.yoshimotoName}。\n駿河・遠江・三河を従え、海道一の弓取りと名高い大大名である。` },
            { type: 'log', msg: `三河を平定した${args.yoshimotoName}はさらに支配地域を拡大するべく、${args.owariProvinceName}への侵攻を目論んでいた。` },
            { type: 'dialog', leftName: args.juushinFName, leftFace: args.juushinFFace, msg: `「殿、お待ちを。${args.nobunagaGivenName}を侮ってはなりません。どうかご再考くだされ。」` },
            { type: 'dialog', leftName: args.yoshimotoName, leftFace: args.yoshimotoFace, msg: `「なんじゃ、臆病風に吹かれたか、${args.juushinFGivenName}。${args.owariProvinceShort}のうつけを相手に、心配が過ぎるのではないか？」` },
            { type: 'dialog', leftName: args.yoshimotoName, leftFace: args.yoshimotoFace, msg: `「${args.nobunagaFamilyName}の小倅ごとき、わし自ら軍を率いて、一息に捻り潰してくれようぞ。」` },
            { type: 'dialog', leftName: args.juushinFName, leftFace: args.juushinFFace, msg: `「うつけとは申しますが、しかし、${args.nobunagaGivenName}の${args.owariProvinceName}をまとめ上げた手腕は本物にござりまする。一筋縄ではいきますまい。」` },
            { type: 'dialog', leftName: args.yoshimotoName, leftFace: args.yoshimotoFace, msg: `「ううむ……」` }
        ];
    },
    okehazama_imagawa_attack: function(args) {
        return [
            { type: 'dialog', leftName: args.yoshimotoName, leftFace: args.yoshimotoFace, msg: `「${args.nobunagaGivenName}なにするものぞ。${args.nobunagaFamilyName}軍など稚児に等しいわ。${args.owariProvinceShort}など、わし自ら一捻りにしてくれよう。」` },
            { type: 'dialog', leftName: args.yoshimotoName, leftFace: args.yoshimotoFace, msg: `「出陣じゃ。支度をいたせ。」` },
            { type: 'dialog', leftName: args.juushinFName, leftFace: args.juushinFFace, msg: `「はっ、出過ぎた真似を申しました。」` },
            { type: 'log', msg: `こうして${args.yoshimotoName}は、${args.owariProvinceName}への侵攻を開始したのであった。` }
        ];
    },
    okehazama_oda_gungi: function(args) {
        return [
            { type: 'log', msg: `一方、${args.yoshimotoGivenName}出陣の報を受け、${args.owariProvinceName}・${args.odaClanName}では重臣らが一同に介し、軍議を行っていた。` },
            { type: 'dialog', leftName: args.juushinAName, leftFace: args.juushinAFace, msg: `「${args.nobunagaGivenName}様、${args.yoshimotoFamilyName}軍は総勢二万五千の大軍でござる。かくなる上は、降伏するしかありませぬ。」` },
            { type: 'dialog', leftName: args.juushinBName, leftFace: args.juushinBFace, msg: `「馬鹿なことを申すな！\n一戦交えずして降伏など武士の名折れにござる。」` },
            { type: 'dialog', leftName: args.juushinBName, leftFace: args.juushinBFace, msg: `「${args.nobunagaGivenName}様、ここは籠城して援軍を待つべきかと。」` },
            { type: 'dialog', leftName: args.shinzanCName, leftFace: args.shinzanCFace, msg: `「何を悠長なことを……殿、ここは一か八か打って出るしかありませぬ！」` },
            { type: 'dialog', leftName: args.shinzanCName, leftFace: args.shinzanCFace, msg: `「引き籠っていては、勝機は開けませぬぞ！」` }
        ];
    },
    okehazama_imagawa_defend: function(args) {
        return [
            { type: 'dialog', leftName: args.yoshimotoName, leftFace: args.yoshimotoFace, msg: `「……あいわかった。おぬしがそこまで申すのであれば、此度の出陣は取りやめとする。」` },
            { type: 'dialog', leftName: args.yoshimotoName, leftFace: args.yoshimotoFace, msg: `「しかし、いずれは相見えねばならぬ敵。心して備えるがよい。」` },
            { type: 'dialog', leftName: args.juushinFName, leftFace: args.juushinFFace, msg: `「ははーっ！」` }
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
            { type: 'dialog', leftName: args.juushinAName, leftFace: args.juushinAFace, msg: `「御意にございます。」` },
            { type: 'dialog', leftName: args.shinzanCName, leftFace: args.shinzanCFace, msg: `「むむむ……」` }
        ];
    }
    
};