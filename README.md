# 合成實驗流程圖工具

整份合成程序是一份 JSON，流程圖、計量表、列印稿與中英文 Experimental section 都由它自動產生。

線上使用：<https://chinglo2025.github.io/easy-synthesis/>

## 執行

```bash
npm run dev     # http://localhost:5173
npm test        # node --test
```

沒有相依套件，也沒有建置步驟。ES modules 需要 http(s) 來源，本機請用 `npm run dev` 開啟，不要直接以 `file://` 開 `index.html`。

## 目錄

```
index.html            應用外框（三欄工作區）
styles/
  base.css            設計 token、控制元件
  layout.css          外框與面板
  cards.css           步驟卡片、對話框、提示
  flow.css            中軸線流程圖
  table.css           文件、計量表、敘述
  print.css           @media print
src/
  model/
    units.js          SI 換算與格式化（內部 mol / kg / m³）
    steps.js          九種步驟型別與列舉的中央定義
    schema.js         建構、走訪、正規化、round-trip
    reagents.js       內建試劑庫（33 溶劑／試劑 + 8 乾燥劑，含 CAS/MW/密度/沸點）
    library.js        個人試劑庫（localStorage）
    sample.js         範例程序
    ids.js
  engine/
    compute.js        純函數 (procedure) => (table, warnings)
  state/
    store.js          past[] / present / future[] 與合併規則
    actions.js        所有文件變更
    prefs.js          按鈕使用頻率、上次使用值
    persist.js        localStorage 薄封裝
  ui/
    palette.js        左側九個模組、基準、範本入口
    sequence.js       卡片序列、xN、分支、freeform、拖曳排序
    editors.js        各型別欄位編輯器
    fields.js         欄位小工具與條件按鈕
    picker.js         化合物選擇器
    flow.js           中軸線流程圖
    metrics.js        計量表與總計
    narrative.js      Experimental section（中英文）
    document.js       文件面板組裝
    modals.js         化合物、範本、命名對話框
    icons.js          24x24 網格圖示（path 字串）
    summary.js        步驟一行摘要
    dom.js / toast.js
  io/
    json.js           匯入匯出、剪貼簿
    templates.js      整份範本與步驟群組
tools/serve.mjs       零依賴靜態伺服器（本機開發用）
tests/                node:test 測試
```

## 實作決定

- **單位**：JSON 用實驗室慣用單位（g/mol、g/mL、mol/L），計算前一律轉 SI，顯示時再格式化。質量、莫耳數、當量至少保留一位小數（10 → 10.0），符合實驗記錄慣例。
- **驅動欄位**：`amount.mode` 即驅動欄位，其餘三欄由引擎推導、以灰色顯示。沒有通用約束求解器。
- **敘述合併**：連續且單純的加料步驟合併為一句（「加入 A 與 B」），其後的攪拌接在同一句；滴加、有 note 或 freeform 的步驟自成一句。是否留白逐步驟判定。
- **留白標記**：有 note 的步驟英文版留白，有 freeform 的步驟中英文皆留白。中文標記為 `［步驟 N：手動輸入，待補寫］`，英文為 `[Step N: manual entry, to be written]`，兩者都加灰底；待補處歸零前，複製的純文字仍保留標記。
- **列印**：列印目前顯示的分頁。流程圖與計量表在同一頁面上下排列，敘述為另一分頁。
- **理論產量**：產物以選填的 `meta.product = { name, mw }` 設定（化合物對話框最下方）；沒有分子量時只顯示莫耳數。
- **分歧深度**：軟性限制兩層。第三層無法建立，第二層會在「待確認」列出提示。
- **按鈕頻率重排**：套用於條件按鈕（氣氛、溫度、時間、方法等）；左側九個模組維持固定順序，避免介面在使用中跳動。
- **資料儲存**：目前程序、個人試劑庫、範本、群組、使用頻率都只存在瀏覽器的 localStorage，不會上傳，也不跨裝置同步。換裝置或清除瀏覽器資料前，請先匯出 JSON。

## 目前不支援

規模重算、單行速記輸入、分批加料、計畫值／實際值雙欄、結構式繪製、匯流（多股料合併為一步）、範圍與公差、安全警告、自由畫布拖放、條件迴圈、多人協作。
