iPhone 離線音樂播放器（Windows 可開發的 PWA）
================================================

功能
- 從裝置選取音訊檔案匯入播放清單
- 匯入歌曲存入瀏覽器 IndexedDB，重新開啟後仍可使用
- 上一首、下一首、播放/暫停、隨機、單曲循環
- 音量控制
- 10 段 Web Audio EQ（31 Hz 至 16 kHz，±12 dB）
- Service Worker 快取網頁程式，第一次載入後可離線開啟
- 可加入 iPhone Safari 主畫面，呈現類 App 介面

重要說明
- 這是 PWA（漸進式網頁 App），不是 App Store 原生 IPA。
- iPhone 要能安裝成主畫面網頁 App，網站必須使用 HTTPS（localhost 除外）。
- Windows 可開發及測試；要讓 iPhone 安裝，最簡單是把整個資料夾部署到 HTTPS 靜態網站。
- 離線播放只適用於已成功匯入且保存在此瀏覽器儲存空間的音樂。
- 若清除 Safari 網站資料、私密瀏覽或儲存空間被系統回收，已匯入音樂可能遺失。請保留原始音樂備份。
- iOS Safari 的格式支援取決於 iOS 版本；建議 MP3、AAC/M4A、WAV。FLAC/OGG 不一定能播放。
- 背景播放與鎖定畫面控制在 iOS PWA 上有平台限制，不能保證與原生 App 完全相同。
- 目前的音量是 Web Audio 主音量節點；EQ 是實際的濾波器，不只是外觀。

在 Windows 電腦測試
1. 解壓縮此 ZIP。
2. 建議用 VS Code 開啟資料夾。
3. 安裝 VS Code 的 Live Server 擴充功能，對 index.html 按右鍵 → Open with Live Server。
   也可用 Python：在資料夾開 CMD，執行 `py -m http.server 8000`。
   注意：本機 HTTP 測試不會模擬 iPhone 安裝流程；Service Worker 只在 localhost/HTTPS 可用。
4. 用電腦瀏覽器測試匯入歌曲、播放和 EQ。

部署到 iPhone（建議 GitHub Pages）
1. 建立 GitHub 帳號與新的 repository。
2. 將 index.html、styles.css、app.js、service-worker.js、manifest.webmanifest、icon-192.png、icon-512.png 上傳到 repository 根目錄。
3. 在 Repository → Settings → Pages，選擇從 main 分支根目錄部署。
4. 等待 GitHub Pages 提供 HTTPS 網址。
5. 在 iPhone 使用 Safari 開啟該 HTTPS 網址。
6. 點 Safari 的「分享」圖示 →「加入主畫面」→ 開啟「以網頁 App 方式打開」（若有顯示）→「加入」。
7. 第一次在線開啟頁面，等它載入完成；之後可在主畫面開啟。先匯入歌曲，才能離線播放。

從 iPhone 匯入音樂
1. 先將音樂檔放到 iPhone「檔案」App（例如「我的 iPhone」或 iCloud Drive）。
2. 開啟已加入主畫面的離線音樂播放器。
3. 按「＋ 加入音樂」，在檔案選擇器中選取一首或多首音樂。
4. 等待顯示「已匯入」，再試著播放。
5. 可先開啟飛航模式測試已快取網頁和已匯入歌曲是否可播放。

本專案完全不需要 Node.js 或 Python 套件。Python 只用來在 Windows 啟動簡易測試伺服器。
