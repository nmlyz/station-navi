# Station Navi

全国対応を目指す、オフライン利用可能な鉄道乗換案内PWA。アカウント登録不要、個人情報は端末内（localStorage / IndexedDB）にのみ保存します。

公開URL: https://nmlyz.github.io/station-navi/

## 使い方
1. 上記URLをiPhone Safari / Android Chrome / PCブラウザで開く
2. 初回セットアップで地域・利用駅を設定（端末内に保存）
3. 「ダウンロード」タブで地域データパックを保存すると、オフラインでも検索できます
4. ホーム画面に追加するとアプリのように使えます（PWA）

## 収録データ（v1.1.0）
駅順・停車種別は各事業者の公開路線図・停車駅案内に基づく実在データのみを収録しています。架空の駅・時刻・運賃は作っていません。

- 関東パック（19路線）: 小田急小田原線/江ノ島線/多摩線、東京メトロ千代田線/同支線/銀座線/丸ノ内線/半蔵門線/日比谷線、JR山手線/中央線/埼京線/横浜線/京浜東北線/南武線、京王線/相模原線、東急田園都市線/東横線
- 関西パック（4路線）: JR大阪環状線/京都線、大阪メトロ御堂筋線/谷町線
- 上記以外の都道府県・路線: **未対応**（アプリ内にも明示。GTFS-JP取込で追加可能）

### 情報未取得として表示するもの
- 時刻表（発着時刻は所要時間からの「目安」表示のみ）
- 運賃
- ホーム番号
- リアルタイム運行情報（ODPT等は利用登録・APIキーが必要なため、キーを埋め込んでいません）

## データ提供元・ライセンスについて
- GTFS-JP: 国土交通省「公共交通オープンデータ」標準仕様。各事業者・自治体が公開するGTFS-JPは提供元のライセンス（多くはCC BY 4.0または公共交通オープンデータ基本ライセンス）に従います。本アプリはGTFS-JPファイル（stops.txt / routes.txt / trips.txt / stop_times.txt）を**端末上でのみ**解析・取り込みし、外部送信しません。
- 同梱パック: 駅名・駅順・種別停車駅という事実情報のみを、各事業者の公開案内をもとに編集したものです。時刻表・運賃データは含みません。

## オフラインと自動更新
- Service Workerがアプリ本体をキャッシュし、駅データはIndexedDBに保存します
- 自動更新（標準ON）: 起動時 / オンライン復帰時 / 6時間ごと / 手動ボタン。差分はバージョンチェックで判定し、取得データは検証（路線・駅数チェック）を通過した場合のみ置き換えます。失敗時は旧データを維持し、更新中も検索できます
- 「Wi-Fiのみ更新」ON時はモバイル通信で更新しません。Safariではバックグラウンド更新が保証されないため、起動時・復帰時にも必ず確認します

## GitHub Pagesへの公開手順
1. このリポジトリをGitHubにpushする
2. Settings → Pages → Source: `Deploy from a branch` / Branch: `main` / `/ (root)` を選択
3. 数分後に `https://<ユーザー名>.github.io/station-navi/` で公開されます
4. データを更新する場合は `data/packs/*.json` と `data/manifest.json` の `version` を上げてpushしてください（アプリ側が自動更新で取得します）

## 必要なAPIキー
なし。同梱データのみで動作します。リアルタイム運行情報を連携する場合のみ、ODPT等の利用登録とAPIキーが別途必要です（キー取得後に各自の環境で組み込んでください。ソースにキーを埋め込まないでください）。

## 構成
```
station-navi/
├── index.html / manifest.json / sw.js / README.md
├── css/style.css
├── js/ app.js database.js search.js routing.js offline.js updater.js gps.js commute.js settings.js
├── data/manifest.json, data/packs/kanto.json, data/packs/kansai.json
└── assets/icons/
```
