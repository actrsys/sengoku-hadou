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
            { type: 'log', msg: `永禄四年。関東管領職を継ぎ、名を${args.kenshinName}と改めた男が、越後より兵を発した。` },
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
    }
};