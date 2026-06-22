# FRONTLINE ROADS — clean refactor

機能ごとに分離して再構築したGitHub管理用の開発版です。v0.12.2では道路データ取得経路を更新しています。

## 現在の構成

- `src/app`: 起動、ライフサイクル、ゲームループ、PWA登録
- `src/core`: 正式状態スキーマ、状態ストア、イベント、共通定数
- `src/location`: 位置情報と座標変換
- `src/roads`: Overpass取得、道路選別、並行道路統合、交差点統合、グラフ、経路探索
- `src/base`: 初回拠点選択と道路グラフへの拠点ノード挿入
- `src/combat`: 敵、敵拠点、ウェーブ、経路、防壁、防衛設備、戦闘
- `src/civilization`: 資源、集落施設、生産、文明発展、前哨地
- `src/persistence`: 保存、旧セーブ移行、不在進行、複数タブ制御
- `src/rendering`: カメラ、道路、戦闘オブジェクト描画
- `src/ui`: 初回拠点、戦闘、文明、メニュー、入力
- `tests`: 構文、依存関係、道路、戦闘、文明、保存、不在進行、長時間進行の検査

## 主要な設計条件

- 道路取得と道路グラフ生成は `RoadService` の一経路だけです。
- 初回拠点選択とゲーム本体は同じ道路グラフを使用し、確定時に再取得しません。
- Canvasのポインター入力所有者は `MapInput` だけです。
- グローバル関数の後付け上書きは使用しません。
- 正式な資源状態は `inventory.resources` だけです。
- オンライン進行と不在進行は同じ `CombatSystem` と `CivilizationSystem` を使用します。
- 正確な現在地はセーブへ残しません。
- 単一HTML生成は開発工程に含めず、ブロックチェーン公開直前まで行いません。

## 起動

ES Modulesを使用するため、HTTPサーバー経由で開きます。

```bash
python -m http.server 8080
```

通常起動:

```text
http://localhost:8080/
```

GPSとOverpassを使わない固定道路の開発確認:

```text
http://localhost:8080/?devFixture=1
```

`devFixture=1` は開発確認専用です。

## 検証

```bash
npm run verify
```

このコマンドは全JavaScriptの構文検査後に全テストを実行します。

## 公開状態

このフォルダはGitHubへ配置する分割ソースです。単一HTML化はブロックチェーン公開直前まで行いません。

## 道路データ取得

ブラウザではCORSに依存しないOverpass JSONPを優先し、失敗時に公式例と同じ最小POSTへ切り替えます。失敗時はサーバー名・方式・原因を初回画面へ表示します。
