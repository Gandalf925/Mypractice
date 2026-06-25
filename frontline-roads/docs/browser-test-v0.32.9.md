# FRONTLINE ROADS v0.32.9 ブラウザ・HTTP確認

## ローカルHTTP

Python `ThreadingHTTPServer` 上で次の経路がすべて HTTP 200 を返すことを確認した。

- `/`
- `/frontline-roads/`
- `/frontline-roads/src/styles/app.css`
- `/frontline-roads/src/app/bootstrap.js`
- `/frontline-roads/src/combat/friendly-force-system.js`
- `/frontline-roads/sw.js`
- `/fr/`

## Headless Chromium

`chromium --headless --no-sandbox --disable-dev-shm-usage --virtual-time-budget=8000 --dump-dom` を開発フィクスチャ付きローカルURLへ実行したが、この実行環境では25秒以内にDOM出力へ到達せずタイムアウトした。コード側の例外やHTTP 404を示す結果ではなく、ブラウザプロセスからDOMを取得できなかったため、ブラウザ描画成功とは判定していない。

## 公開HTTPSで確認する項目

- 実機GPSによる「現」ボタンの追従位置
- タッチ操作での敵マーカー選択と迎撃派兵
- 縦画面・横画面でのカメラ操作ボタンと下部施設ツールの重なり
- Service Worker更新後にv0.32.9資産へ切り替わること
