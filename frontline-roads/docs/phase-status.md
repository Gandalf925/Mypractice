# Refactor phase status

| Phase | Status | Main verification |
|---|---|---|
| 0 Legacy audit | Complete | 重複道路処理、起動競合、関数上書き、入力重複を台帳化 |
| 1 Foundation | Complete | ES Modules、明示依存、構文検査、循環依存なし |
| 2 State/lifecycle | Complete | 正式状態スキーマ、状態遷移、単一ゲームループ |
| 3 Roads | Complete | 取得一回、道路選別、並行道路統合、交差点統合、経路探索 |
| 4 Initial base placement | Complete | 1km以内の道路直接選択、拠点ノード挿入、確定時再取得なし |
| 5 Rendering/input | Complete | Canvas入力所有者一つ、カメラ・道路・戦闘描画分離 |
| 6 Combat | Complete | 敵、敵拠点、ウェーブ、防壁、4系統設備、経路変更、都市被害 |
| 7 Save migration | Complete | JSON保存、派生索引再構築、旧公開版と旧refactor版の移行 |
| 8 Offline progress | Complete | 戦闘・生産・文明を同じシステムで最大12時間、決定性確認 |
| 9 Civilization | Complete | 正式資源、集落施設、生産、文明発展、廃墟前哨地、再出現 |
| 10 Full UI | Complete | 初回拠点、戦闘HUD、選択パネル、文明、生産、メニュー |
| 11 Performance/stability | Complete | 敵上限、複数タブ、復帰処理、PWA資産、12時間進行、保存容量 |
| 12 Single HTML | Deferred | ブロックチェーン公開直前にのみ実施 |
| Final audit | Complete locally | 構文検査と42自動テスト合格。ブラウザ実画面試験は環境ポリシーで遮断 |
| Upload | Not performed | ユーザーの明示的なアップロード指示待ち。公開版は未変更 |
