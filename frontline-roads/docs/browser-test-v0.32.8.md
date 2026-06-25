# FRONTLINE ROADS v0.32.8 ブラウザ・通信確認

## ローカルHTTP配信

GitHub Pages相当のディレクトリ構成をローカルHTTPサーバーで配信し、以下がすべて HTTP 200 で取得できることを確認した。

- `/`
- `/fr/`
- `/frontline-roads/`
- `/frontline-roads/src/app/bootstrap.js`
- `/frontline-roads/src/roads/road-service.js`
- `/frontline-roads/src/roads/road-parser.js`
- `/frontline-roads/sw.js`
- `/frontline-roads/manifest.webmanifest`

## Headless Chromium

Headless ChromiumによるDOM生成も試行したが、実行環境側の制限により完了しなかった。

- inotify設定の読み取り失敗
- DBusソケット不在
- NETLINKソケット作成権限なし
- DOM出力前にタイムアウト

アプリ由来のJavaScript例外を確認できた、という結果ではない。ただし、ブラウザ上でのGPS、タッチ操作、Service Worker更新、Canvas描画はこの環境では最終確認できていない。

## 公開Overpass API

公開Overpass APIへの実通信を試行したが、この作業環境では外部DNSを解決できず、HTTP通信開始前に失敗した。

したがって、公開サーバーから実地域の道路を受信できたとは主張しない。通信後の処理については、Overpass形式の応答を使った専用テストで、解析、主要道路保持、チャンク統合、保存、復元まで確認している。
