/**
 * event_text.js
 * イベントの文章や会話の台本をまとめて管理するファイルです。
 * 顔画像は左側しか使いません。
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
    // 清洲同盟（使者の到着まで）
    kiyosu_alliance_part1: function(args) {
        return [
            { type: 'log', msg: `今川義元の死後、三河で独立を果たした${args.motoyasuName}は、隣国${args.imagawaFamilyName}家と敵対関係となっていた。` },
            { type: 'log', msg: `${args.motoyasuGivenName}は長年に渡り敵対関係にあった${args.odaFamilyName}家との同盟を模索していた。` },
            { type: 'dialog', leftName: args.motoyasuName, leftFace: args.motoyasuFace, msg: `「皆々様方、ご足労いただき感謝申し上げる」` },
            { type: 'dialog', leftName: args.motoyasuName, leftFace: args.motoyasuFace, msg: `「集まってもらったは他でもない。${args.odaFamilyName}との同盟の件じゃ。」` },
            { type: 'dialog', leftName: args.kashinAName, leftFace: args.kashinAFace, msg: `「殿、なりませぬぞ」` },
            { type: 'dialog', leftName: args.kashinAName, leftFace: args.kashinAFace, msg: `「${args.odaFamilyName}と我らは、先々代の清孝公の時代より敵対してまいりました。今さら同盟などと、納得できぬ者も多いでしょう」` },
            { type: 'dialog', leftName: args.kashinBName, leftFace: args.kashinBFace, msg: `「そうは申すが、人質を出さぬと決めた以上、${args.imagawaFamilyName}とはもはやこれまで。一触即発の関係にござる」` },
            { type: 'dialog', leftName: args.kashinBName, leftFace: args.kashinBFace, msg: `「その上、三河の掌握もままならぬとなれば、${args.odaFamilyName}の力添え無くして我らの生き残る道はありますまい」` }
        ];
    },

    // 清洲同盟（松平家専用：使者を送るルート）
    kiyosu_alliance_matsudaira_accept: function(args) {
        return [
            { type: 'dialog', leftName: args.motoyasuName, leftFace: args.motoyasuFace, msg: `「……うむ。決めたぞ」` },
            { type: 'dialog', leftName: args.motoyasuName, leftFace: args.motoyasuFace, msg: `「${args.kashinAGivenName}よ、おぬしの言い分ももっともじゃ。しかし、${args.odaFamilyName}と結ぶは必定であるとわしは考えておる」` },
            { type: 'dialog', leftName: args.kashinAName, leftFace: args.kashinAFace, msg: `「は……なれど、${args.nobunagaGivenName}は油断ならぬ男。容易にはいきますまい」` },
            { type: 'dialog', leftName: args.motoyasuName, leftFace: args.motoyasuFace, msg: `「うむ。此度はわし自ら${args.nobunagaCastleShort}に赴かねばなるまい」` },
            { type: 'dialog', leftName: args.motoyasuName, leftFace: args.motoyasuFace, msg: `「わし自ら訪問することで、当方の誠意と覚悟を見せるのじゃ。よいな」` },
            { type: 'dialog', leftName: args.kashinAName, leftFace: args.kashinAFace, msg: `「ははっ！」` },
            { type: 'log', msg: `${args.year}年${args.month}月　${args.nobunagaCastleName}` }
        ];
    },
    // 清洲同盟（松平家専用：使者を送らないルート）
    kiyosu_alliance_matsudaira_reject: function(args) {
        return [
            { type: 'dialog', leftName: args.motoyasuName, leftFace: args.motoyasuFace, msg: `「……いや、やはり${args.odaFamilyName}と結ぶのは時期尚早か」` },
            { type: 'dialog', leftName: args.kashinAName, leftFace: args.kashinAFace, msg: `「御意。長年の怨恨、そう容易く拭えるものではありませぬ」` },
            { type: 'dialog', leftName: args.motoyasuName, leftFace: args.motoyasuFace, msg: `「うむ。此度の話は無かったことにいたそう」` }
        ];
    },
    
    // 清洲同盟（織田家専用：使者の取り次ぎ）
    kiyosu_alliance_oda_arrival: function(args) {
        return [
            { type: 'dialog', leftName: args.shinzanCName, leftFace: args.shinzanCFace, msg: `「殿。${args.matsudairaFamilyName}家から使者が参っておりまする」` },
            { type: 'dialog', leftName: args.nobunagaName, leftFace: args.nobunagaFace, msg: `「${args.matsudairaFamilyName}か……ふむ」` }
        ];
    },

    // 清洲同盟（織田家専用：面会決定〜対面）
    kiyosu_alliance_oda_accept: function(args) {
        return [
            { type: 'dialog', leftName: args.nobunagaName, leftFace: args.nobunagaFace, msg: `「ふっ、会うてやろうではないか。通せ」` },
            { type: 'dialog', leftName: args.shinzanCName, leftFace: args.shinzanCFace, msg: `「はっ！」` },
            { type: 'log', msg: `${args.nobunagaGivenName}と${args.motoyasuGivenName}は、${args.nobunagaCastleName}内で対面した。` }
        ];
    },

    // 清洲同盟（面会して同盟成立ルート）
    kiyosu_alliance_accept: function(args) {
        return [
            { type: 'dialog', leftName: args.nobunagaName, leftFace: args.nobunagaFace, msg: `「おぬし自ら来るとはのう。よう来た、竹千代」` },
            { type: 'dialog', leftName: args.motoyasuName, leftFace: args.motoyasuFace, msg: `「お懐かしゅうございまする、吉法師様。いえ、${args.nobunagaTitle}様」` },
            { type: 'dialog', leftName: args.nobunagaName, leftFace: args.nobunagaFace, msg: `「はっはっは！\nわしとそなたの仲ではないか。吉法師で構わぬわい」` },
            { type: 'dialog', leftName: args.motoyasuName, leftFace: args.motoyasuFace, msg: `「はっ。吉法師様。まこと、懐かしゅうござりまする」` },
            { type: 'dialog', leftName: args.nobunagaName, leftFace: args.nobunagaFace, msg: `「うむ、息災で何よりである」` },
            { type: 'dialog', leftName: args.nobunagaName, leftFace: args.nobunagaFace, msg: `「して……おぬしがここへ来たとなれば、${args.imagawaFamilyName}とは袂を分かつ心づもりであるな？」` },
            { type: 'dialog', leftName: args.motoyasuName, leftFace: args.motoyasuFace, msg: `「はっ。ご明察にござる。${args.matsudairaFamilyName}家が生き残る道はこれしかござらぬ。どうか我らと結んでいただきたく」` },
            { type: 'dialog', leftName: args.nobunagaName, leftFace: args.nobunagaFace, msg: `「……ふっ、敵地に堂々と乗り込むおぬしの豪胆さには参ったわい」` },
            { type: 'dialog', leftName: args.nobunagaName, leftFace: args.nobunagaFace, msg: `「あいわかった。今日より我らは盟友じゃ」` },
            { type: 'dialog', leftName: args.nobunagaName, leftFace: args.nobunagaFace, msg: `「西はわし。東はおぬしじゃ。それで良かろう？」` },
            { type: 'dialog', leftName: args.motoyasuName, leftFace: args.motoyasuFace, msg: `「ははっ！　まこと、うれしゅう存じまする！」` },
            { type: 'dialog', leftName: args.nobunagaName, leftFace: args.nobunagaFace, msg: `「うむ、今日はよい日じゃ。はっはっはっ……」` },
            { type: 'dialog', leftName: args.motoyasuName, leftFace: args.motoyasuFace, msg: `「はっはっはっ……」` },
            { type: 'log', msg: `こうして、${args.odaClanName}と${args.matsudairaClanName}の同盟は成立した。` }
        ];
    },
    // 清洲同盟（織田家専用：使者を追い返すルート）
    kiyosu_alliance_reject: function(args) {
        return [
            { type: 'dialog', leftName: args.nobunagaName, leftFace: args.nobunagaFace, msg: `「追い返せ」` },
            { type: 'dialog', leftName: args.shinzanCName, leftFace: args.shinzanCFace, msg: `「へ……？　よろしいのですか？」` },
            { type: 'dialog', leftName: args.nobunagaName, leftFace: args.nobunagaFace, msg: `「我らと結びたいと申すのであろう。構わぬ、追っ払え」` },
            { type: 'dialog', leftName: args.shinzanCName, leftFace: args.shinzanCFace, msg: `「は、ははーっ！」` }
        ];
    },
    
    //桶狭間の戦い
    okehazama_part1: function(args) {
        return [
            { type: 'log', msg: `覇を競う群雄の中にあって、東海に一際大きな影があった。` },
            { type: 'log', msg: `${args.yoshimotoName}。\n駿河・遠江・三河を従え、海道一の弓取りと名高い大大名である。` },
            { type: 'log', msg: `三河を平定した${args.yoshimotoName}はさらに支配地域を拡大するべく、大軍を率いて${args.sunpuCastleName}より出陣。${args.owariProvinceName}への侵攻を開始した。` },
            { type: 'log', msg: `一方、${args.yoshimotoGivenName}出陣の報を受け、${args.owariProvinceName}・${args.nobunagaFamilyName}家では重臣らが一同に介し、軍議を行っていた。` },
            { type: 'dialog', leftName: args.juushinAName, leftFace: args.juushinAFace, msg: `「${args.nobunagaGivenName}様、${args.yoshimotoFamilyName}軍は総勢二万五千の大軍でござる。かくなる上は、降伏するしかありませぬ」` },
            { type: 'dialog', leftName: args.juushinBName, leftFace: args.juushinBFace, msg: `「馬鹿なことを申すな！　一戦交えずして降伏など武士の名折れにござる」` },
            { type: 'dialog', leftName: args.juushinBName, leftFace: args.juushinBFace, msg: `「${args.nobunagaGivenName}様、ここは籠城して援軍を待つべきかと」` },
            { type: 'dialog', leftName: args.shinzanCName, leftFace: args.shinzanCFace, msg: `「何を悠長なことを……殿、ここは一か八か打って出るしかありませぬ！」` },
            { type: 'dialog', leftName: args.shinzanCName, leftFace: args.shinzanCFace, msg: `「引き籠っていては、勝機は開けませぬぞ！」` }
        ];
    },
    okehazama_imagawa_part1: function(args) {
        return [
            { type: 'log', msg: `覇を競う群雄の中にあって、東海に一際大きな影があった。` },
            { type: 'log', msg: `${args.yoshimotoName}。\n駿河・遠江・三河を従え、海道一の弓取りと名高い大大名である。` },
            { type: 'log', msg: `三河を平定した${args.yoshimotoName}はさらに支配地域を拡大するべく、${args.owariProvinceName}への侵攻を目論んでいた。` },
            { type: 'dialog', leftName: args.juushinFName, leftFace: args.juushinFFace, msg: `「殿、お待ちを。${args.nobunagaGivenName}を侮ってはなりません。${args.owariProvinceName}への出陣はどうかご再考くだされ」` },
            { type: 'dialog', leftName: args.yoshimotoName, leftFace: args.yoshimotoFace, msg: `「なんじゃ、臆病風に吹かれたか、${args.juushinFGivenName}。${args.owariProvinceShort}のうつけを相手に、心配が過ぎるのではないか？」` },
            { type: 'dialog', leftName: args.yoshimotoName, leftFace: args.yoshimotoFace, msg: `「${args.nobunagaFamilyName}の小倅ごとき、わし自ら軍を率いて、一息に捻り潰してくれようぞ」` },
            { type: 'dialog', leftName: args.juushinFName, leftFace: args.juushinFFace, msg: `「しかし、${args.nobunagaGivenName}の${args.owariProvinceName}をまとめ上げた手腕は本物にござりまする。一筋縄ではいきますまい」` },
            { type: 'dialog', leftName: args.juushinFName, leftFace: args.juushinFFace, msg: `「うつけとは申しますが、あれとて周囲を欺く策略やもしれませぬぞ」` },
            { type: 'dialog', leftName: args.yoshimotoName, leftFace: args.yoshimotoFace, msg: `「ううむ……」` }
        ];
    },
    okehazama_imagawa_attack: function(args) {
        return [
            { type: 'dialog', leftName: args.yoshimotoName, leftFace: args.yoshimotoFace, msg: `「ふん！　${args.nobunagaGivenName}なにするものぞ！　${args.nobunagaFamilyName}軍など稚児に等しい……わし自ら一捻りにしてくれよう！」` },
            { type: 'dialog', leftName: args.juushinFName, leftFace: args.juushinFFace, msg: `「はっ。出過ぎた真似を申しました」` },
            { type: 'dialog', leftName: args.yoshimotoName, leftFace: args.yoshimotoFace, msg: `「出陣じゃ！　支度をいたせ！」` },
            { type: 'log', msg: `こうして${args.yoshimotoName}は大軍をもって${args.owariProvinceName}への侵攻を開始したのであった。` }
        ];
    },
    okehazama_oda_gungi: function(args) {
        return [
            { type: 'log', msg: `一方、${args.yoshimotoGivenName}出陣の報を受け、${args.owariProvinceName}・${args.odaClanName}では重臣らが一同に介し、軍議を行っていた。` },
            { type: 'dialog', leftName: args.juushinAName, leftFace: args.juushinAFace, msg: `「${args.nobunagaGivenName}様、${args.yoshimotoFamilyName}軍は総勢二万五千の大軍でござる。かくなる上は、降伏するしかありませぬ」` },
            { type: 'dialog', leftName: args.juushinBName, leftFace: args.juushinBFace, msg: `「馬鹿なことを申すな！　一戦交えずして降伏など武士の名折れにござる」` },
            { type: 'dialog', leftName: args.juushinBName, leftFace: args.juushinBFace, msg: `「${args.nobunagaGivenName}様、ここは籠城して援軍を待つべきかと」` },
            { type: 'dialog', leftName: args.shinzanCName, leftFace: args.shinzanCFace, msg: `「何を悠長なことを……殿、ここは一か八か打って出るしかありませぬ！」` },
            { type: 'dialog', leftName: args.shinzanCName, leftFace: args.shinzanCFace, msg: `「引き籠っていては、勝機は開けませぬぞ！」` }
        ];
    },
    okehazama_imagawa_defend: function(args) {
        return [
            { type: 'dialog', leftName: args.yoshimotoName, leftFace: args.yoshimotoFace, msg: `「……あいわかった。おぬしがそこまで申すのであれば、此度の出陣は取りやめとする」` },
            { type: 'dialog', leftName: args.yoshimotoName, leftFace: args.yoshimotoFace, msg: `「しかし、いずれ必ず${args.owariProvinceName}は取る！　心して備えよ！」` },
            { type: 'dialog', leftName: args.juushinFName, leftFace: args.juushinFFace, msg: `「はっ。御意にございまする」` }
        ];
    },
    okehazama_attack: function(args) {
        return [
            { type: 'dialog', leftName: args.nobunagaName, leftFace: args.nobunagaFace, msg: `「誰ぞ、鼓をもて！」` },
            { type: 'dialog', leftName: "小姓", leftFace: "koshou.webp", msg: `「はっ！」` },
            { type: 'log', msg: `${args.nobunagaGivenName}は小姓の鼓の音に合わせて舞いはじめた。` },
            { type: 'dialog', leftName: args.nobunagaName, leftFace: args.nobunagaFace, msg: `「人間五十年、下天の内をくらぶれば、夢幻のごとくなり。一度生を得て、滅せぬ者のあるべきか……」` },
            { type: 'dialog', leftName: args.nobunagaName, leftFace: args.nobunagaFace, msg: `「出陣じゃ、具足をもて！」` },
            { type: 'dialog', leftName: args.shinzanCName, leftFace: args.shinzanCFace, msg: `「はっ。お供いたしまする！」` },
            { type: 'dialog', leftName: args.juushinBName, leftFace: args.juushinBFace, msg: `「ははっ！」` },
            { type: 'log', msg: `国境での迎撃を採用した${args.nobunagaGivenName}は、軍勢を率いて出陣した。` },
            { type: 'log', msg: `その頃、${args.yoshimotoFamilyName}軍が${args.nobunagaFamilyName}方の丸根砦、鷲津城を陥落せしめたとの知らせが${args.nobunagaGivenName}に届く。` },
            { type: 'log', msg: `${args.nobunagaGivenName}は善照寺に入り、およそ三千の軍勢を整え、迂回して出撃。進軍を開始した。` },
            { type: 'dialog', leftName: args.shinzanDName, leftFace: args.shinzanDFace, msg: `「殿、${args.yoshimotoName}は桶狭間山に本陣を敷いておりまする！」` },
            { type: 'log', msg: `その時、にわかに雨が降り出した。たちまち黒雲が戦場を覆い、雷鳴が轟いた。視界を妨げる程の豪雨であった。` },
            { type: 'dialog', leftName: args.nobunagaName, leftFace: args.nobunagaFace, msg: `「見よ！　天も我に味方しておるわ！　此度の戦、勝ったも同然よ！」` },
            { type: 'dialog', leftName: args.nobunagaName, leftFace: args.nobunagaFace, msg: `「今じゃ！　全軍、一丸となって突っ込め！」` },
            { type: 'dialog', leftName: args.shinzanCName, leftFace: args.shinzanCFace, msg: `「おおお－っ！！」` },
            { type: 'log', msg: `${args.nobunagaFamilyName}軍は豪雨に乗じて兵を進め、${args.yoshimotoName}の本陣に奇襲をかけた。兵を分散させていた${args.yoshimotoGivenName}本陣の兵は二千に満たなかった。` },
            { type: 'log', msg: `${args.yoshimotoName}は自らも奮戦したが、${args.nobunagaFamilyName}軍の猛攻により、次々と兵は討ち取られていった。` },
            { type: 'log', msg: `勢いを得た${args.nobunagaFamilyName}軍は、とうとう${args.yoshimotoGivenName}を追い詰めた。` },
            { type: 'dialog', leftName: args.yoshimotoName, leftFace: args.yoshimotoFace, msg: `「まさか、かようなところでこのわしが……天が、${args.nobunagaGivenName}に味方したというのか……」` },
            { type: 'dialog', leftName: args.yoshimotoName, leftFace: args.yoshimotoFace, msg: `「ぐふっ……」` },
            { type: 'dialog', leftName: args.mouriName, leftFace: args.mouriFace, msg: `「${args.yoshimotoName}、${args.mouriName}が討ち取ったり！」` },
            { type: 'log', msg: `こうして、海道一の弓取りとうたわれた${args.yoshimotoName}は${args.owariProvinceShort}の地でその生涯を終えた。` },
            { type: 'log', msg: `${args.owariProvinceShort}のうつけが${args.yoshimotoName}を討ち取ったとの知らせはまたたく間に広まり、${args.nobunagaGivenName}は一躍その名を全国に轟かせることとなった。` }
        ];
    },
    okehazama_defend: function(args) {
        return [
            { type: 'dialog', leftName: args.nobunagaName, leftFace: args.nobunagaFace, msg: `「……籠城じゃ。あれほどの大軍相手に打って出るなど真の勇者ではない。それは匹夫の勇じゃ」` },
            { type: 'dialog', leftName: args.juushinAName, leftFace: args.juushinAFace, msg: `「はっ。左様にございまする」` },
            { type: 'dialog', leftName: args.juushinBName, leftFace: args.juushinBFace, msg: `「むむむ……しかしそれでは万に一つも勝ち目はありませぬぞ」` },
            { type: 'dialog', leftName: args.nobunagaName, leftFace: args.nobunagaFace, msg: `「もう決めた事じゃ。各々籠城の支度に取り掛かるがよい」` },
            { type: 'dialog', leftName: args.juushinAName, leftFace: args.juushinAFace, msg: `「ははっ！」` },
            { type: 'dialog', leftName: args.juushinBName, leftFace: args.juushinBFace, msg: `「……はっ！」` }
        ];
    },

    // 川中島の戦い
    kawanakajima_event: function(args) {
        return [
            { type: 'log', msg: `${args.year}年${args.month}月。関東管領職を継いだ${args.kenshinName}が越後より兵を発した。` },
            { type: 'log', msg: `関東制圧を目指す${args.kenshinName}にとって、信濃を固め後顧の憂いを断つことは急務であった。` },
            { type: 'log', msg: `${args.kenshinGivenName}は海津城を制圧せしめんと、一万三千の兵を率いて出陣。善光寺を経て妻女山に布陣した。` },
            { type: 'log', msg: `これを受けて${args.shingenName}も甲府を発し、茶臼山に対陣した。総勢およそ二万。` },
            { type: 'log', msg: `両軍は千曲川を挟んで睨み合い、膠着状態が続いた。` },
            { type: 'log', msg: `${args.takedaFamilyName}軍は戦線硬直を避けるため、八幡原を横断して海津城に入城した。` },
            { type: 'log', msg: `しかし、海津城への入城後も膠着状態は続いた。士気の低下を恐れた${args.takedaFamilyName}の重臣は、${args.uesugiFamilyName}軍との決戦を主張した。` },
            { type: 'log', msg: `海津城　${args.takedaFamilyName}本陣` },
            { type: 'dialog', leftName: args.nobushigeName, leftFace: args.nobushigeFace, msg: `「兄上。このままでは兵の士気が下がる一方です」` },
            { type: 'dialog', leftName: args.nobushigeName, leftFace: args.nobushigeFace, msg: `「ここは打って出て、決戦を仕掛けるべきかと。兵数では我らが上回っておりまする」` },
            { type: 'dialog', leftName: args.shingenName, leftFace: args.shingenFace, msg: `「いかんぞ、${args.nobushigeGivenName}。${args.kenshinGivenName}ほどの戦巧者をわしは知らぬ。侮ってよい相手ではないのだ」` },
            { type: 'dialog', leftName: args.kansukeName, leftFace: args.kansukeFace, msg: `「しからば、拙者に一計がござりまする」` },
            { type: 'dialog', leftName: args.shingenName, leftFace: args.shingenFace, msg: `「申してみよ、勘助」` },
            { type: 'dialog', leftName: args.kansukeName, leftFace: args.kansukeFace, msg: `「はっ。では説明させていただきまする」` },
            { type: 'dialog', leftName: args.kansukeName, leftFace: args.kansukeFace, msg: `「まず兵を二手に分けます。そして別働隊をもって夜の内に妻女山を衝き、麓の八幡原へと追い落とします」` },
            { type: 'dialog', leftName: args.kansukeName, leftFace: args.kansukeFace, msg: `「八幡原に布陣した本隊がこれを待ち伏せし、挟み込んで一網打尽にするのです」` },
            { type: 'dialog', leftName: args.kansukeName, leftFace: args.kansukeFace, msg: `「いかに${args.kenshinGivenName}と言えど、これでしまいにござる」` },
            { type: 'dialog', leftName: args.nobushigeName, leftFace: args.nobushigeFace, msg: `「おお……」` },
            { type: 'dialog', leftName: args.kansukeName, leftFace: args.kansukeFace, msg: `「名付けて、啄木鳥」` },
            { type: 'dialog', leftName: args.shingenName, leftFace: args.shingenFace, msg: `「……なるほど。啄木鳥が木を叩いて虫を飛び立たせるが如く、驚いて飛び出した虫を喰らう、ということか」` },
            { type: 'dialog', leftName: args.kansukeName, leftFace: args.kansukeFace, msg: `「はっ、ご明察の通りにございまする」` },
            { type: 'dialog', leftName: args.nobushigeName, leftFace: args.nobushigeFace, msg: `「兄上。やりましょう」` },
            { type: 'dialog', leftName: args.shingenName, leftFace: args.shingenFace, msg: `「……よし、やろう」` },
            { type: 'dialog', leftName: args.shingenName, leftFace: args.shingenFace, msg: `「別働隊一万二千を${args.toratsunaFamilyName}・${args.nobufusaFamilyName}の両名に預ける」` },
            { type: 'dialog', leftName: args.shingenName, leftFace: args.shingenFace, msg: `「わしは八幡原に鶴翼の陣を敷き、${args.kenshinGivenName}を待ち受ける。よいな？」` },
            { type: 'dialog', leftName: args.kansukeName, leftFace: args.kansukeFace, msg: `「ははっ！ 御意にござりまする！」` },
            { type: 'log', msg: `妻女山　${args.uesugiFamilyName}本陣` },
            { type: 'dialog', leftName: args.kageieName, leftFace: args.kageieFace, msg: `「殿、海津城の炊煙がいつになく増しているとのことです」` },
            { type: 'dialog', leftName: args.kenshinName, leftFace: args.kenshinFace, msg: `「${args.shingenGivenName}め、逸ったな！ 目端の利く者に城を見張らせておったかいがあったわ！」` },
            { type: 'dialog', leftName: args.kageieName, leftFace: args.kageieFace, msg: `「殿、どうなさいますか？」` },
            { type: 'dialog', leftName: args.kenshinName, leftFace: args.kenshinFace, msg: `「ふん、夜陰に乗じて我々の背後を突くつもりであろう」` },
            { type: 'dialog', leftName: args.kenshinName, leftFace: args.kenshinFace, msg: `「我らはすみやかに妻女山を下り、川を渡る。そして手薄となるであろう、${args.takedaFamilyName}本隊に急襲を仕掛けるのじゃ」` },
            { type: 'dialog', leftName: args.kenshinName, leftFace: args.kenshinFace, msg: `「${args.kagemochiFamilyName}殿に兵一千を預ける。これをもって${args.takedaFamilyName}軍の別働隊に備え、渡河を阻止されたし」` },
            { type: 'dialog', leftName: args.kagemochiName, leftFace: args.kagemochiFace, msg: `「はっ！」` },
            { type: 'dialog', leftName: args.kenshinName, leftFace: args.kenshinFace, msg: `「これより、一切の物音を立てることを禁ずる。粛々と川を渡るべし。兵にも徹底させるのじゃ」` },
            { type: 'dialog', leftName: args.kageieName, leftFace: args.kageieFace, msg: `「御意」` },
            { type: 'dialog', leftName: args.kenshinName, leftFace: args.kenshinFace, msg: `「ふふ……目にものを見せてくれようぞ、${args.shingenGivenName}」` },
            { type: 'log', msg: `翌朝。川中島を包む深い霧が晴れた。` },
            { type: 'log', msg: `${args.shingenName}率いる${args.takedaFamilyName}本隊の前には、いるはずのない${args.uesugiFamilyName}軍の姿があった。` },
            { type: 'dialog', leftName: args.kansukeName, leftFace: args.kansukeFace, msg: `「なんと……これは……」` },
            { type: 'dialog', leftName: args.shingenName, leftFace: args.shingenFace, msg: `「おのれ、してやられたわ！ 直ちに迎撃の準備をせよ！」` },
            { type: 'dialog', leftName: args.nobushigeName, leftFace: args.nobushigeFace, msg: `「だ、駄目です兄上。兵どもが動揺して……」` },
            { type: 'dialog', leftName: args.shingenName, leftFace: args.shingenFace, msg: `「ええい、なんということだ」` },
            { type: 'log', msg: `${args.uesugiFamilyName}軍は${args.kageieName}軍を先頭に、車懸りの陣で猛然と襲いかかった` },
            { type: 'log', msg: `凄まじい波状攻撃を浴びて${args.takedaFamilyName}軍は防戦一方となり、危機的状況に陥った。` },
            { type: 'log', msg: `乱戦の中、${args.nobushigeName}、${args.kansukeName}といった重臣らが次々と討死していった。` },
            { type: 'log', msg: `手薄となった${args.shingenGivenName}の本陣に、白手拭いで頭を包み、放生月毛に跨った騎馬武者が、名刀・小豆長光を振り上げて斬り込んだ。` },
            { type: 'log', msg: `${args.kenshinName}である。` },
            { type: 'dialog', leftName: args.kenshinName, leftFace: args.kenshinFace, msg: `「${args.shingenGivenName}、覚悟っ！」` },
            { type: 'dialog', leftName: args.shingenName, leftFace: args.shingenFace, msg: `「ぐぬうっ！ ${args.kenshinGivenName}かっ！？」` },
            { type: 'log', msg: `${args.shingenGivenName}は立ち上がり、軍配をもって${args.kenshinGivenName}の太刀を受け止めた。` },
            { type: 'log', msg: `側近が槍で馬を突くと、馬は驚いて駆け出し、${args.kenshinGivenName}はその場を去った。` },
            { type: 'log', msg: `妻女山　${args.takedaFamilyName}軍の別働隊` },
            { type: 'log', msg: `もぬけの空となった妻女山。そこに攻め込んだ${args.takedaFamilyName}軍の別働隊は異変に気付き、急ぎ八幡原へと軍を進めていた。` },
            { type: 'log', msg: `しかし、別働隊の行く手に、${args.uesugiFamilyName}軍のしんがりを務める${args.kagemochiName}が立ちふさがった。` },
            { type: 'log', msg: `${args.kagemochiName}勢は大軍を受け止めながら見事な撤退戦を展開。果敢に別働隊を足止めした` },
            { type: 'log', msg: `昼前になって、ようやく${args.takedaFamilyName}軍の別働隊が八幡原に到着。` },
            { type: 'log', msg: `挟撃される形となった${args.uesugiFamilyName}軍は兵を引き、越後へと撤退していった。` },
            { type: 'log', msg: `${args.uesugiFamilyName}方・死者三千余、${args.takedaFamilyName}方・死者四千余。互いに多数の犠牲を出す未曾有の大いくさとなった。` },
            { type: 'log', msg: `川中島での両者の激突の報は、瞬く間に日ノ本全土へと知れ渡ることとなった。` }
        ];
    },

    // 永禄の変（パート1）
    eiroku_no_hen_part1: function(args) {
        return [
            { type: 'log', msg: `${args.nagayasuCastleName}` },
            { type: 'dialog', leftName: args.nagayasuName, leftFace: args.nagayasuFace, msg: `「ええい、先代様が亡くなって以来、何もかもうまくいかぬわい」` },
            { type: 'dialog', leftName: args.masakatsuName, leftFace: args.masakatsuFace, msg: `「公方様の動きも活発になっておるようじゃな。あれが死んだのが余程嬉しいらしい」` },
            { type: 'dialog', leftName: args.tomomichiName, leftFace: args.tomomichiFace, msg: `「それよ。多方に手を回しておるようだが……」` },
            { type: 'dialog', leftName: args.masakatsuName, leftFace: args.masakatsuFace, msg: `「何も言えぬよ。我らとしても、公方様が相手となっては臣下の礼を取らざるをえまい」` },
            { type: 'dialog', leftName: args.nagayasuName, leftFace: args.nagayasuFace, msg: `「……邪魔じゃな」` },
            { type: 'dialog', leftName: args.masakatsuName, leftFace: args.masakatsuFace, msg: `「……左様」` },
            { type: 'dialog', leftName: args.tomomichiName, leftFace: args.tomomichiFace, msg: `「……如何するつもりだ？」` },
            { type: 'dialog', leftName: args.nagayasuName, leftFace: args.nagayasuFace, msg: `「決まっておる。お隠れになっていただくのよ」` },
            { type: 'dialog', leftName: args.tomomichiName, leftFace: args.tomomichiFace, msg: `「ふむ……とすると、ちょうどよい男がおるな」` },
            { type: 'dialog', leftName: args.nagayasuName, leftFace: args.nagayasuFace, msg: `「奇遇じゃのう。わしにも心当たりがあるわい」` },
            { type: 'dialog', leftName: args.masakatsuName, leftFace: args.masakatsuFace, msg: `「……おぬしら、まさか」` },
            { type: 'dialog', leftName: args.nagayasuName, leftFace: args.nagayasuFace, msg: `「ふ、ふふふふふ……」` },
            { type: 'log', msg: `${args.year}年${args.month}月 京の空は薄曇りであった。` },
            { type: 'log', msg: `この頃、将軍・${args.yoshiteruName}は幕府権威の回復を目指し、二条御所の大改築を進めていた。` },
            { type: 'log', msg: `石垣と大堀を備えた城郭のような御所は、将軍の決意の表れでもあった。` },
            { type: 'log', msg: `${args.yoshiteruGivenName}は自ら政治決済を行い、その政治的地位を固めていった。` },
            { type: 'log', msg: `諸大名の争いにも積極的に介入し、大名らに将軍家が一定の影響力を持つことを示し、その存在感を増していったのである。` },
            { type: 'log', msg: `一方で、畿内の覇者として君臨した${args.miyoshiFamilyName}家であったが、当主・${args.nagayoshiName}の死後、その影響力を失いつつあった。` },
            { type: 'log', msg: `傀儡としての将軍を求める${args.miyoshiFamilyName}家にとって、意のままにならない将軍は邪魔な存在であった。` },
            { type: 'log', msg: `${args.year}年${args.month}月。${args.miyoshiFamilyName}家当主・${args.yoshitsuguName}は三人衆の説得を受け、一万余の軍勢を率いて上洛した。` },
            { type: 'log', msg: `革堂、知恩寺、相国寺に分宿した${args.miyoshiFamilyName}家の動向は、あくまで平穏であった。` },
            { type: 'log', msg: `しかし、翌明朝、${args.yoshitsuguGivenName}勢は清水寺参詣を名目として、突如、二条御所に押し寄せた。` },
            { type: 'log', msg: `戦端が開かれたのは、辰の刻のことであった。` }
        ];
    },

    // 永禄の変（パート2）
    eiroku_no_hen_part2: function(args) {
        return [
            { type: 'log', msg: `御所内の軍勢はわずか二百に満たなかった。${args.yoshiteruGivenName}は劣勢を悟り、死を覚悟した。` },
            { type: 'dialog', leftName: args.yoshiteruName, leftFace: args.yoshiteruFace, msg: `「おのれ、天下を乱す狼藉者どもめ……」` },
            { type: 'dialog', leftName: args.yoshiteruName, leftFace: args.yoshiteruFace, msg: `「この${args.yoshiteruGivenName}、将軍として恥じぬ死に様を見せてくれようぞ！」` },
            { type: 'log', msg: `${args.yoshiteruGivenName}は近臣を率い、薙刀を振るって斬り込んだ。` },
            { type: 'log', msg: `塚原卜伝に兵法を学んだ将軍の技は凄まじく、切れ味の鈍った刀を幾度も持ち替えて奮戦した。` },
            { type: 'log', msg: `しかし、多勢に無勢。近臣たちは次々と討死していった。` },
            { type: 'log', msg: `牛の初刻、${args.yoshiteruGivenName}はついに討たれた。` },
            { type: 'log', msg: `${args.yoshiteruGivenName}の関係者はことごとく自害し、あるいは殺害された。` },
            { type: 'log', msg: `殺戮が終わると、${args.miyoshiFamilyName}軍は二条御所に火を放った。多くの殿舎が炎に包まれた。` }
        ];
    },

    // 永禄の変（パート3）
    eiroku_no_hen_part3: function(args) {
        return [
            { type: 'dialog', leftName: args.fujitakaName, leftFace: args.fujitakaFace, msg: `「そんな……公方様が……」` },
            { type: 'log', msg: `幕臣・${args.fujitakaName}が変事を聞いて馳せ参じた頃には、すべて終わった後のことであった。` },
            { type: 'dialog', leftName: args.fujitakaName, leftFace: args.fujitakaFace, msg: `「……いかん、こうしてはおれぬ。${args.yoshiakiGivenName}様の御身が心配じゃ」` },
            { type: 'log', msg: `${args.fujitakaName}はすぐさまその場を離れ、${args.yoshiteruGivenName}の弟・${args.yoshiakiGivenName}の救出に向けて動き出した。` },
            { type: 'log', msg: `この日の夕刻、焼け跡には激しい夕立の雨が降リ注いだ。` }
        ];
    },
    
    // 将軍庇護第１段階 足利義昭が朝倉家を頼る
    shogun_protection_1: function(args) {
        return [
            { type: 'log', msg: `${args.year}年${args.month}月 越前国 一乗谷` },
            { type: 'dialog', leftName: args.fujitakaName, leftFace: args.fujitakaFace, msg: `「お初にお目にかかる。某、${args.fujitakaFamilyName}${args.fujitakaTitle}と申す者にござる」` },
            { type: 'dialog', leftName: args.asakuraName, leftFace: args.asakuraFace, msg: `「よう参られました。朝倉${args.asakuraTitle}にございまする」` },
            { type: 'dialog', leftName: args.fujitakaName, leftFace: args.fujitakaFace, msg: `「うむ。此度は直接の会談の場を設けていただき、感謝申し上げる」` },
            { type: 'log', msg: `亡き将軍・${args.yoshiteruName}。` },
            { type: 'log', msg: `その弟・覚慶は、${args.hisahideFamilyName}らによって興福寺にとどめおかれ、${args.miyoshiFamilyName}勢によって監視されていた。` },
            { type: 'log', msg: `興福寺・一乗院に入っていた覚慶は、将来的に興福寺別当の座を約束されていた。` },
            { type: 'log', msg: `興福寺は大和において権勢を誇っており、覚慶を殺害した場合に興福寺を敵に回すことをおそれ、${args.miyoshiFamilyName}勢は覚慶をあくまで軟禁するのみにとどめていた。` },
            { type: 'log', msg: `覚慶は兄の遺臣である${args.fujitakaName}らの手引きによって、密かに興福寺から脱出し、足利将軍家の当主になることを宣言。` },
            { type: 'log', msg: `還俗して「足利義秋」と名乗り、朝廷から従五位下・左馬頭の叙位・任官を受けていた。` },
            { type: 'log', msg: `その後、義秋は${args.asakuraName}のいる一乗谷に迎え入れられた。` },
            { type: 'log', msg: `一乗谷では義秋の元服式が執り行われ、この時、義秋は「足利義昭」と再び改名をしている。` },
            { type: 'dialog', leftName: args.fujitakaName, leftFace: args.fujitakaFace, msg: `「越前はよき土地にござるな。左馬頭様も一乗谷を気に入られたご様子じゃ」` },
            { type: 'dialog', leftName: args.asakuraName, leftFace: args.asakuraFace, msg: `「それはなによりにござりまする」` },
            { type: 'dialog', leftName: args.fujitakaName, leftFace: args.fujitakaFace, msg: `「左馬頭様は時折、遠い目をなさるのだ」` },
            { type: 'dialog', leftName: args.asakuraName, leftFace: args.asakuraFace, msg: `「ほう」` },
            { type: 'dialog', leftName: args.fujitakaName, leftFace: args.fujitakaFace, msg: `「${args.miyoshiFamilyName}の者が畿内を牛耳り、我が物顔で京を闊歩する。このような世の中に大層お嘆きであらせられる」` },
            { type: 'dialog', leftName: args.asakuraName, leftFace: args.asakuraFace, msg: `「……は。心中お察しいたしまする」` },
            { type: 'dialog', leftName: args.fujitakaName, leftFace: args.fujitakaFace, msg: `「我らには左馬頭様のご懸念を取って払う義務がござる」` },
            { type: 'dialog', leftName: args.fujitakaName, leftFace: args.fujitakaFace, msg: `「${args.asakuraTitle}殿も同じ心持ちであることは、我らも存ずるところ」` },
            { type: 'dialog', leftName: args.fujitakaName, leftFace: args.fujitakaFace, msg: `「ともに左馬頭様を盛り立てて参りましょうぞ」` },
            { type: 'dialog', leftName: args.asakuraName, leftFace: args.asakuraFace, msg: `「左馬頭様におかれましては、お労しゅうございまする」` },
            { type: 'dialog', leftName: args.asakuraName, leftFace: args.asakuraFace, msg: `「越前は冬になると美しい雪が見られまする。左馬頭様のお心の慰みにもなりましょう」` },
            { type: 'dialog', leftName: args.fujitakaName, leftFace: args.fujitakaFace, msg: `「……」` },
            { type: 'dialog', leftName: args.asakuraName, leftFace: args.asakuraFace, msg: `「ここらに住む者としましては、雪が深うなりましたら、移動には不便なのがちと厄介でございますが。帰ることすらままなりませぬゆえ」` },
            { type: 'dialog', leftName: args.fujitakaName, leftFace: args.fujitakaFace, msg: `「左馬頭様は${args.asakuraTitle}殿を頼りにされておられる」` },
            { type: 'dialog', leftName: args.asakuraName, leftFace: args.asakuraFace, msg: `「左馬頭様も流浪の折にはさぞかしお辛い思いをなされたことでしょう」` },
            { type: 'dialog', leftName: args.asakuraName, leftFace: args.asakuraFace, msg: `「しばらく当家にご滞在なされるがよろしかろうと存じまする」` },
            { type: 'dialog', leftName: args.fujitakaName, leftFace: args.fujitakaFace, msg: `「……ご厚意、重々に痛み入る。しからば、本日はこれにて」` },
            { type: 'log', msg: `足利義昭は一乗谷において、上洛に向けて諸大名への協力要請を積極的に行った。` },
            { type: 'log', msg: `しかし、そのいずれもが実現には至らず、義昭の滞在は長期間に及ぶこととなったのである。` }
        ];
    }
};