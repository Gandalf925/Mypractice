# FRONTLINE ROADS v0.32.10 モーダル表示復旧

## 発生事象

Android版Chromium系ブラウザで、メニュー内の表示品質を変更すると、暗いモーダル背景だけが残り、メニューカードが描画されなくなる場合がありました。設定値は`localStorage`へ保存されるため、再読み込み後も文明・拠点・派兵などのモーダルを開くたびに同じ状態へ戻りました。

## 原因

1. タッチ端末の初期品質は`minimal`ですが、品質配列が`full → balanced → minimal`の順だったため、初回タップで`minimal`から最も負荷の高い`full`へ移動していました。
2. `full`では`.modalOverlay`へ`backdrop-filter: blur(8px)`が有効になり、Android Chromiumの一部環境で、開いているオーバーレイの子要素が合成レイヤーから消える症状を誘発していました。
3. 旧CSSには、表示品質セレクタとモーダル・初期拠点MAPのセレクタがカンマで連結された箇所があり、レーダー品質設定がDOMパネルの`filter`、`clip-path`、`backdrop-filter`へ波及していました。
4. モーダルを閉じる操作がカード内の×ボタンだけだったため、カードが描画されないと復旧操作も失われていました。

## 修正

- `.modalOverlay`の`backdrop-filter`と`-webkit-backdrop-filter`を常時`none`へ変更。
- `.modalCard`へ`opacity: 1`、`visibility: visible`、`filter: none`、`backdrop-filter: none`を明示。
- 表示品質別CSSから`.modalOverlay`、`.modalCard`、`.panel`、`.contextPanel`、`.toolButton`への波及を削除。
- 壊れていた`html[data-radar-motion="off"]`のセレクタとモバイルメディアクエリを分離。
- 品質順を`minimal → balanced → full`へ変更。タッチ端末の初回タップは省電力から標準へ進みます。
- メニュー、文明、拠点司令部、派兵画面に共通の緊急閉鎖処理を追加。
  - 暗い背景部分のタップで閉じる。
  - Escapeキーで閉じる。
  - `hidden`と`aria-hidden`を同期する。

## データ互換性

ゲーム進行データ、セーブキー、セーブスキーマは変更していません。既に保存されている`full`品質設定も削除せず、そのまま安全に表示できます。

## 固定テスト

- モーダル背景にblurが存在しないこと。
- モーダルカードが常に可視・無フィルターであること。
- 表示品質セレクタがモーダルへ作用しないこと。
- `, @media`のような壊れたセレクタ連結が存在しないこと。
- 背景タップで閉鎖でき、カード内部タップでは閉じないこと。
- 全4種類の全画面パネルが共通の復旧処理を使用すること。
- タッチ端末の品質遷移が`minimal → balanced`であること。
