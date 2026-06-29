export const LANGUAGE_STORAGE_KEY = 'frontline-roads.language';

export const SUPPORTED_LANGUAGES = Object.freeze([
  { code: 'ja', label: '日本語', nativeName: '日本語', flag: '🇯🇵' },
  { code: 'en', label: 'English', nativeName: 'English', flag: '🇺🇸' }
]);

export const TEXT_CATALOG = Object.freeze({
  ja: {
    language: {
      changed: '表示言語を日本語に変更しました。',
      title: '言語',
      description: '画面表示に使う言語を切り替えます。ゲーム進行やセーブ内容には影響しません。',
      current: '現在の言語'
    },
    menu: {
      title: 'メニュー',
      tabOps: '作戦',
      tabGuide: '遊び方',
      tabDisplay: '表示',
      tabSystem: '保存',
      opsLoading: '作戦目標を取得しています。',
      opsUnavailable: '作戦目標を取得できません。',
      guideTitle: '遊び方',
      displayTitle: 'レーダー表示',
      displayNote: '表示だけを変更します。ゲーム進行やセーブ内容には影響しません。',
      systemTitle: '保存・初期化',
      systemNote: '通常は自動保存されます。端末を変える前や更新前に手動保存できます。完全初期化は現在のセーブ、道路キャッシュ、旧形式の退避データを削除します。',
      saveReady: '現在の状態を保存',
      saveUnavailable: '保存できません',
      reset: 'ゲームを完全初期化',
      saved: '現在の状態を保存しました。',
      saveFailed: '保存できません。このタブを閉じると進行状況は失われます。',
      resetConfirm: 'ゲームの進行状況を完全に初期化します。元に戻せません。続行しますか？'
    },
    guide: [
      { title: '基本進行', body: '現在地周辺の道路に本拠地を置き、防衛設備で守りながら部隊を派兵して敵拠点を攻略します。敵拠点の攻略、回収物の確保、施設建設、資源納入を進めると文明レベルが上がります。' },
      { title: '道路防衛', body: '主要拠点・簡易拠点・現在地・遠征部隊の建設範囲内へ設備を置きます。壁は敵味方の双方を止め、門は味方を通しながら敵を足止めします。敵の詳しい進軍経路は表示しません。' },
      { title: '道端物資', body: '道路沿いの資源箱は近づくと自動回収します。保管上限を超える資源は取得されません。地雷・誘導信号・爆撃支援・出撃札はITEMSで対象を選んで使用します。' },
      { title: '敵への派兵', body: '敵拠点を選ぶと拠点攻撃、敵部隊を選ぶと追跡迎撃を開始できます。単独出撃では地図で派兵経路を指定し、最大2か所の経由地点を追加できます。連携出撃も出撃前にMAPで共通経路を指定し、同じ拠点から同じルートで進軍します。先導・同時到着・手動遅延を選べます。' },
      { title: '文明発展', body: 'CIV画面で不足条件を確認し、資源を納入して発展を開始します。「予備を残して納入」は防衛・建設用の最低限の資源を残して不足分だけ投入します。Lv.7では主要拠点と簡易拠点の数上限がなくなります。' },
      { title: '位置情報・不在中', body: '正確な移動履歴は保存しません。道路追加時に周辺位置を外部道路データサービスへ送信し、保存時の地図基準点は約10m単位へ丸めます。不在中の戦闘・生産・文明建設は最大24時間まで計算されます。' }
    ],
    static: {
      titleBoot: 'BOOT',
      basePlacementEyebrow: 'RADAR INITIALIZATION // 初回拠点設置',
      basePlacementTitle: '1km以内の道路を直接選択',
      basePlacementDescription: '最初に現在地から1km以内の道路を選び、移動せず開始できます。開始後は実際の移動に合わせて周辺道路を順次取得し、未確認地域をMAPへ追加します。',
      roadSelectionLabel: 'MAP // ROAD SELECTION',
      roadSelectionHint: '道路をタップして拠点候補を指定',
      basePlacementStatus: '初期化しています…',
      confirmBase: 'この道路に拠点を設置',
      retryLocation: '位置情報と道路を再取得',
      privacyNotice: '正確な移動履歴は保存しません。保存時は道路地図の基準地点を約10m単位へ丸めます。移動先の道路取得時には、その周辺位置を外部道路データサービスへ送信します。',
      homeHp: '本拠地HP',
      enemySquads: '敵部隊',
      civLevel: '文明Lv.',
      bases: 'BASES // 拠点',
      civ: 'CIV // 文明',
      items: 'ITEMS // 物資',
      menu: 'MENU',
      offlineTitle: '不在中も世界は進行しました',
      confirm: '確認',
      baseCommandLabel: '拠点司令部',
      baseCommandTitle: '拠点司令部',
      deploymentLabel: '選択目標への派兵',
      deploymentTitle: '選択目標への派兵',
      civilizationLabel: '文明と生産',
      civilizationTitle: '文明・資源・生産',
      suppliesLabel: '道端物資とインベントリ',
      suppliesTitle: '道端物資・消耗品',
      assetRecoveryTitle: '表示データを読み込めませんでした',
      assetRecoveryText: '通信状態を確認して再読み込みしてください。ゲームのセーブデータは削除されません。',
      assetRecoveryButton: '保存済みゲームを再読み込み',
      footerPrefix: '開発版'
    },
    dynamic: {
      resources: { wood: '木材', stone: '石材', fiber: '繊維', copperOre: '銅鉱石', tinOre: '錫鉱石', ironOre: '鉄鉱石', timber: '加工木材', rope: '縄', cutStone: '切石', charcoal: '木炭', copperIngot: '銅塊', tinIngot: '錫塊', bronzeIngot: '青銅塊', ironBloom: '鉄塊', wroughtIron: '鍛鉄', steel: '鋼材', mechanism: '機構部品' }
    },
    aria: {
      roadMap: '道路地図',
      baseViewport: '拠点候補道路の選択地図',
      mapControls: '地図操作',
      zoomIn: '拡大',
      zoomOut: '縮小',
      recenter: '地図を中央へ戻す',
      resourceSummary: '保有資材',
      tacticalMapControls: '戦術地図操作',
      tacticalTools: '防衛設備',
      menuSwitch: 'メニュー表示切替'
    }
  },
  en: {
    language: {
      changed: 'Display language changed to English.',
      title: 'Language',
      description: 'Change the language used by the interface. This does not affect game progress or save data.',
      current: 'Current language'
    },
    menu: {
      title: 'Menu',
      tabOps: 'Operations',
      tabGuide: 'Guide',
      tabDisplay: 'Display',
      tabSystem: 'Save',
      opsLoading: 'Loading operation goals.',
      opsUnavailable: 'Operation goals are unavailable.',
      guideTitle: 'How to Play',
      displayTitle: 'Radar Display',
      displayNote: 'These settings only change display behavior. They do not affect game progress or save data.',
      systemTitle: 'Save / Reset',
      systemNote: 'The game normally saves automatically. Use manual save before changing devices or updating. Full reset deletes the current save, road cache, and old backup data.',
      saveReady: 'Save current state',
      saveUnavailable: 'Save unavailable',
      reset: 'Fully reset game',
      saved: 'Current state saved.',
      saveFailed: 'Saving is unavailable. Progress will be lost if this tab is closed.',
      resetConfirm: 'This will fully reset game progress and cannot be undone. Continue?'
    },
    guide: [
      { title: 'Core Progression', body: 'Place your home base on a road near your current location, defend it with facilities, and send squads to attack enemy bases. Civilization level rises by capturing enemy bases, securing recovered goods, constructing facilities, and delivering required resources.' },
      { title: 'Road Defense', body: 'Build facilities within the construction ranges of major bases, simple bases, your current position, and deployed squads. Walls stop both enemies and allies. Gates let allies pass while holding enemies back. Detailed enemy marching routes are not shown.' },
      { title: 'Roadside Supplies', body: 'Resource crates along roads are collected automatically when you approach them. Resources above storage capacity are not obtained. Mines, guidance signals, bombing support, and dispatch tickets are used from ITEMS after selecting a target.' },
      { title: 'Dispatching Squads', body: 'Select an enemy base to launch a base attack, or select an enemy squad to start pursuit interception. Solo dispatch lets you choose a route on the map and add up to two waypoints. Coordinated dispatch can also use a shared route before launch, sending squads from the same base along the same route. You can choose vanguard, synchronized arrival, or manual delay.' },
      { title: 'Civilization Growth', body: 'Open CIV to check unmet requirements, deliver resources, and start development. “Deliver while keeping reserves” fills only the shortage while retaining minimum resources for defense and construction. At Lv.7, major and simple base count limits are removed.' },
      { title: 'Location and Offline Progress', body: 'Exact movement history is not saved. When adding roads, nearby location data is sent to an external road data service. Saved map origins are rounded to about 10 meters. Combat, production, and civilization construction are simulated for up to 24 hours while away.' }
    ],
    static: {
      titleBoot: 'BOOT',
      basePlacementEyebrow: 'RADAR INITIALIZATION // First Base Setup',
      basePlacementTitle: 'Select a road within 1 km',
      basePlacementDescription: 'First, choose a road within 1 km of your current location and start without moving. After the game begins, nearby roads are acquired as you actually move, expanding the map into undiscovered areas.',
      roadSelectionLabel: 'MAP // ROAD SELECTION',
      roadSelectionHint: 'Tap a road to choose a base candidate',
      basePlacementStatus: 'Initializing…',
      confirmBase: 'Place base on this road',
      retryLocation: 'Retry location and road loading',
      privacyNotice: 'Exact movement history is not saved. Saved road map origins are rounded to about 10 meters. When roads are acquired at a destination, nearby location data is sent to an external road data service.',
      homeHp: 'Home HP',
      enemySquads: 'Enemies',
      civLevel: 'Civ Lv.',
      bases: 'BASES',
      civ: 'CIV',
      items: 'ITEMS',
      menu: 'MENU',
      offlineTitle: 'The world advanced while you were away',
      confirm: 'Confirm',
      baseCommandLabel: 'Base Command',
      baseCommandTitle: 'Base Command',
      deploymentLabel: 'Dispatch to Selected Target',
      deploymentTitle: 'Dispatch to Selected Target',
      civilizationLabel: 'Civilization and Production',
      civilizationTitle: 'Civilization / Resources / Production',
      suppliesLabel: 'Roadside Supplies and Inventory',
      suppliesTitle: 'Roadside Supplies / Consumables',
      assetRecoveryTitle: 'Display data could not be loaded',
      assetRecoveryText: 'Check the connection and reload. Your game save data will not be deleted.',
      assetRecoveryButton: 'Reload saved game',
      footerPrefix: 'Development build'
    },
    dynamic: {
      resources: { wood: 'Wood', stone: 'Stone', fiber: 'Fiber', copperOre: 'Copper ore', tinOre: 'Tin ore', ironOre: 'Iron ore', timber: 'Timber', rope: 'Rope', cutStone: 'Cut stone', charcoal: 'Charcoal', copperIngot: 'Copper ingot', tinIngot: 'Tin ingot', bronzeIngot: 'Bronze ingot', ironBloom: 'Iron bloom', wroughtIron: 'Wrought iron', steel: 'Steel', mechanism: 'Mechanism parts' }
    },
    aria: {
      roadMap: 'Road map',
      baseViewport: 'Base candidate road selection map',
      mapControls: 'Map controls',
      zoomIn: 'Zoom in',
      zoomOut: 'Zoom out',
      recenter: 'Recenter map',
      resourceSummary: 'Stored resources',
      tacticalMapControls: 'Tactical map controls',
      tacticalTools: 'Defense facilities',
      menuSwitch: 'Menu tab switcher'
    }
  }
});


export const INLINE_COPY_CATALOG = Object.freeze({
  ja: Object.freeze({}),
  en: Object.freeze({
    '予備を残して合計': 'Delivered a reserve-safe total of ',
    '加工・金属資材を除外し、合計': 'Delivered basic resources only, total ',
    '資材を納入しました。': ' resources.',
    '予備を残して一括納入できる資源がありません。': 'No resources can be delivered while keeping reserves.',
    '加工・金属資材を除外し、予備を残して納入できる資源がありません。': 'No basic resources can be delivered while keeping reserves.',
    '操作できません。': 'Action unavailable.',
    'を納入しました。': ' delivered.',
    'を建設しました。': ' constructed.',
    '個、生産予約しました。': ' queued for production.',
    '現在地を取得してください。': 'Acquire your current location.',
    '位置情報が古いため使用できません。現在地を再取得してください。': 'Location data is too old. Refresh your current location.',
    '位置情報の精度が不足しています。': 'Location accuracy is insufficient.',
    'アイテムを使用できません。': 'Item cannot be used.',
    '一時部隊を出撃できません。': 'Temporary squad cannot be dispatched.',
    '誘導信号を使用できません。': 'Guidance signal cannot be used.',
    '製作できません。': 'Cannot craft.',
    '撤去できません。': 'Cannot remove.',
    '派兵できません。': 'Cannot dispatch.',
    '選択した部隊種類は存在しません。': 'Selected squad type does not exist.',
    '文明Lv.': 'Civ Lv.',
    'で解禁されます。': ' required.',
    'この施設では生産できません。': 'This facility cannot produce that recipe.',
    '回収可能な特殊アイテムではありません。': 'This is not a recoverable special item.',
    '迎撃可能な敵部隊ではありません。': 'This enemy cannot be intercepted.',
    '攻撃可能な敵拠点ではありません。': 'This enemy base cannot be attacked.',
    '回収地点へ到達できる道路経路がありません。': 'No road route reaches the recovery point.',
    '敵部隊の進路へ到達できる道路経路がありません。': 'No road route reaches the enemy squad path.',
    '敵拠点へ到達できる道路経路がありません。': 'No road route reaches the enemy base.',

    '木材': 'Wood', '石材': 'Stone', '繊維': 'Fiber',
    '銅鉱石': 'Copper ore', '錫鉱石': 'Tin ore', '鉄鉱石': 'Iron ore',
    '加工木材': 'Timber', '縄': 'Rope', '切石': 'Cut stone', '木炭': 'Charcoal',
    '銅塊': 'Copper ingot', '錫塊': 'Tin ingot', '青銅塊': 'Bronze ingot',
    '鉄塊': 'Iron bloom', '鍛鉄': 'Wrought iron', '鋼材': 'Steel', '機構部品': 'Mechanism parts',
    '基本資材': 'Basic materials', '加工資材': 'Processed materials', '鉱石': 'Ore', '金属・部品': 'Metals / Parts',
    'なし': 'None', '上限なし': 'No limit', '未選択': 'None', '不要': 'Not needed',

    '原始集落': 'Primitive Settlement', '中央焚火': 'Central Fire',
    '定住集落': 'Settled Village', '集会小屋': 'Meeting Hut',
    '石工集落': 'Stonework Settlement', '石造集会所': 'Stone Meeting Hall',
    '青銅砦': 'Bronze Fort', '青銅の砦': 'Bronze Keep',
    '鉄器都市': 'Iron City', '鉄の城館': 'Iron Manor',
    '鋼鉄城塞': 'Steel Citadel', '鋼鉄本丸': 'Steel Keep',
    '機械都市': 'Machine City', '機関司令庁': 'Mechanism Command Office',
    '街道連邦': 'Road Federation', '統合司令府': 'Unified Command',

    '簡易倉庫': 'Simple Storehouse',
    '木材・石材・繊維と初期加工資材の保管上限を増やします。': 'Increases storage capacity for wood, stone, fiber, and early processed materials.',
    '木工場': 'Carpentry',
    '木材を加工木材へ変換します。加工木材は施設や防衛設備の建設・強化に使います。': 'Converts wood into timber. Timber is used to build and upgrade facilities and defenses.',
    '縄工房': 'Ropeworks',
    '繊維を縄へ加工します。縄は施設建設や部隊・防衛設備の整備に使います。': 'Processes fiber into rope. Rope is used for facility construction, squads, and defense maintenance.',
    '石切場': 'Stonecutter',
    '石材を切石へ加工します。切石は石造施設と防衛設備の建設・強化に使います。': 'Cuts stone into cut stone for stone facilities and defense upgrades.',
    '石造倉庫': 'Stone Storehouse',
    '基礎資源・加工資材・鉱石・金属の保管上限を大きく増やします。': 'Greatly increases storage capacity for basic resources, processed materials, ore, and metals.',
    '炭焼き窯': 'Charcoal Kiln',
    '木材を木炭へ加工します。木炭は銅・錫・鉄の精錬に必要です。': 'Processes wood into charcoal for copper, tin, and iron smelting.',
    '銅炉': 'Copper Furnace',
    '銅鉱石と木炭から銅塊を精錬します。青銅生産の主材料です。': 'Smelts copper ore and charcoal into copper ingots, the main material for bronze.',
    '錫炉': 'Tin Furnace',
    '錫鉱石と木炭から錫塊を精錬します。銅塊と合わせて青銅を作ります。': 'Smelts tin ore and charcoal into tin ingots, combined with copper to make bronze.',
    '試験青銅炉': 'Trial Bronze Furnace',
    '銅塊と錫塊から青銅塊を生産します。発展計画に青銅が必要な間は、完成品を優先的に計画へ納入します。建設できるのは1基だけです。': 'Produces bronze ingots from copper and tin ingots. While a development plan needs bronze, output is delivered to the plan first. Only one can be built.',
    '青銅倉庫': 'Bronze Storehouse',
    '全資源区分の保管上限を増やし、青銅期の大量生産を支えます。': 'Increases all storage categories to support bronze-age mass production.',
    '青銅工房': 'Bronze Workshop',
    '銅塊と錫塊を青銅塊へ加工します。青銅装備や上位施設に使います。': 'Processes copper and tin ingots into bronze ingots for bronze equipment and advanced facilities.',
    '塊鉄炉': 'Bloomery',
    '鉄鉱石と木炭から鉄塊を作ります。鍛鉄生産の前工程です。': 'Produces iron blooms from iron ore and charcoal, the first step toward wrought iron.',
    '鍛冶場': 'Forge',
    '鉄塊を鍛鉄へ加工します。鉄器施設と上位防衛設備に使います。': 'Processes iron blooms into wrought iron for iron facilities and advanced defenses.',
    '鉄器倉庫': 'Iron Storehouse',
    '全資源区分の保管上限を増やし、鉄器都市の備蓄を支えます。': 'Increases all storage categories to support iron-city stockpiles.',
    '戦術工房': 'Tactical Workshop',
    '戦術素材と加工・金属資材を使い、地雷・誘導信号・遠隔支援・出撃札を製作します。': 'Uses tactical materials plus processed and metal resources to craft mines, guidance signals, remote support, and dispatch tickets.',
    '要塞庫': 'Fortress Depot',
    '全資材カテゴリの保管上限を大幅に増やす高容量備蓄施設です。': 'A high-capacity depot that greatly increases every storage category.',
    '鋼鉄倉庫': 'Steel Storehouse',
    '鋼材を含む金属資源と大規模防衛用資材の保管上限を増やします。': 'Increases storage for steel, other metals, and large-scale defense materials.',
    '製鋼炉': 'Steelworks',
    '鍛鉄と木炭から鋼材を製造します。鋼鉄防衛設備と工兵部隊に必要です。': 'Produces steel from wrought iron and charcoal for steel defenses and engineer squads.',
    '機械倉庫': 'Mechanism Storehouse',
    '鋼材と機構部品を中心に、機械都市の高度資材を保管します。': 'Stores advanced machine-city materials, mainly steel and mechanism parts.',
    '機構工房': 'Mechanism Workshop',
    '鋼材・加工木材・縄から機構部品を製造します。機械防衛設備と砲撃部隊に必要です。': 'Produces mechanism parts from steel, timber, and rope for mechanized defenses and artillery squads.',
    '連邦倉庫': 'Federal Storehouse',
    '全資源区分の保管上限を大幅に増やし、街道連邦の大規模備蓄を支えます。': 'Greatly increases all storage categories to support Road Federation stockpiles.',
    '統合工廠': 'Integrated Arsenal',
    '鋼材と機構部品を高効率で一括生産し、街道連邦全体へ供給します。': 'Mass-produces steel and mechanism parts efficiently for the entire Road Federation.',
    '統合鋼材': 'Integrated Steel', '統合機構部品': 'Integrated Mechanism Parts', '試験青銅': 'Trial Bronze',

    '突撃部隊': 'Assault Squad', '万能型': 'All-purpose', '通常敵と敵基地の両方へ対応できる基本部隊です。': 'A basic squad that can fight both normal enemies and enemy bases.',
    '遊撃部隊': 'Skirmisher Squad', '軽装迎撃': 'Light interception', '高速で軽装敵を処理しますが、重装敵と敵基地には弱い部隊です。': 'Fast squad for clearing light enemies, but weak against heavy enemies and bases.',
    '攻城部隊': 'Siege Squad', '基地破壊': 'Base demolition', '敵基地へ非常に高い損害を与えますが、単独では道中の敵に弱いため連携出撃で護衛が必要です。': 'Deals very high damage to enemy bases, but needs escort in coordinated dispatch because it is weak on the road.',
    '重装部隊': 'Heavy Squad', '味方防護': 'Ally protection', '近くの味方部隊が受ける損害の一部を肩代わりする護衛部隊です。': 'An escort squad that absorbs part of the damage taken by nearby allied squads.',
    '遠征部隊': 'Expedition Squad', '長距離作戦': 'Long-range operations', '高い総合戦闘力を持ち、戦闘から離れると少量ずつ自己回復します。さらに現在位置の周囲120mを移動式の建設圏として利用できます。': 'A strong all-round squad that slowly self-recovers outside combat and provides a 120 m mobile construction range around its current position.',
    '工兵部隊': 'Engineer Squad', '破城・現地修復': 'Demolition / Field repair', '敵施設への攻撃と前線設備の手動修復を担当します。修復には対象設備に応じた資源が必要です。': 'Attacks enemy facilities and manually repairs frontline defenses. Repair costs depend on the target facility.',
    '砲撃部隊': 'Artillery Squad', '遠距離範囲攻撃': 'Long-range area attack', '密集した敵を遠距離から攻撃します。移動速度と耐久が低いため、重装部隊などの護衛が必要です。': 'Attacks clustered enemies from long range. Low speed and durability make escort important.',
    '指揮部隊': 'Command Squad', '部隊連携支援': 'Squad coordination support', '周囲の味方部隊の攻撃力と移動速度を高める統合作戦部隊です。主要拠点ごとに同時運用できるのは1隊です。': 'A coordination squad that boosts nearby allied attack and speed. Each major base can operate only one at a time.',
    '回収部隊': 'Recovery Squad', '遠隔回収': 'Remote recovery', '特殊アイテムを遠隔回収できますが、戦闘力と耐久は非常に低い部隊です。': 'Can remotely recover special items, but has very low combat power and durability.',

    '突撃出撃札': 'Assault Dispatch Ticket', '遊撃出撃札': 'Skirmisher Dispatch Ticket', '攻城出撃札': 'Siege Dispatch Ticket',
    '掃討信号弾': 'Sweep Signal Flare', '破城爆薬': 'Breach Charge', '路上地雷': 'Road Mine', '誘導信号弾': 'Guidance Flare',
    '行軍加速旗': 'March Banner', '緊急撤退煙幕': 'Emergency Smoke Screen', '指向性地雷': 'Directional Mine',
    '重装破砕地雷': 'Armor-Breaker Mine', '遠隔砲撃': 'Remote Barrage', '航空支援': 'Air Support', '広域制圧支援': 'Area Suppression Support',
    '強化信管': 'Reinforced Fuse', '誘導ビーコン': 'Guidance Beacon', '高密度繊維束': 'Dense Fiber Bundle', '圧縮爆薬芯': 'Compressed Charge Core',
    '精密照準器': 'Precision Sight', '戦術通信器': 'Tactical Radio', '航空支援コード': 'Air Support Code', '広域制圧指令': 'Area Suppression Order', '戦略爆撃標識': 'Strategic Strike Marker',

    '丸太柵': 'Log Palisade', '木柵': 'Wooden Palisade', '石壁': 'Stone Wall', '青銅補強壁': 'Bronze-Reinforced Wall', '鉄壁': 'Iron Wall', '鋼鉄補強壁': 'Steel-Reinforced Wall', '機構防壁': 'Mechanized Wall', '城塞防壁': 'Fortress Wall',
    '石門': 'Stone Gate', '青銅門': 'Bronze Gate', '鉄門': 'Iron Gate', '鋼鉄門': 'Steel Gate', '機関門': 'Mechanized Gate', '城塞大門': 'Fortress Gate',
    '投石台': 'Stone Thrower', '強化投石台': 'Reinforced Stone Thrower', '石造投石塔': 'Stone Thrower Tower', '青銅投槍台': 'Bronze Javelin Platform', '鉄弩砲': 'Iron Ballista', '連弩塔': 'Repeater Ballista Tower', '機関弩砲': 'Mechanized Ballista', '精密連弩砲': 'Precision Repeater Ballista',
    '岩落とし台': 'Rock Dropper', '大型岩落とし台': 'Large Rock Dropper', '牽引式投石機': 'Towed Catapult', '青銅破砕機': 'Bronze Crusher', '重投石機': 'Heavy Catapult', '鋼鉄投石機': 'Steel Catapult', '平衡錘式投石機': 'Counterweight Catapult', '城塞砲撃台': 'Fortress Bombard Platform',
    '蔓縄罠': 'Vine Snare', '杭と縄の罠': 'Stake-and-Rope Snare', '重石罠': 'Weighted Snare', '青銅拘束具': 'Bronze Restraint', '鉄杭罠': 'Iron Stake Trap', '鎖式拘束具': 'Chain Restraint', '機構拘束装置': 'Mechanized Restraint', '道路封鎖網': 'Road Blockade Net',
    '修繕小屋': 'Repair Hut', '木工修繕所': 'Carpentry Repair Post', '石工修繕所': 'Masonry Repair Post', '青銅修繕所': 'Bronze Repair Post', '鉄器修繕所': 'Iron Repair Post', '鋼鉄修繕所': 'Steel Repair Post', '機械修繕所': 'Mechanical Repair Post', '中央整備所': 'Central Maintenance Station',
    '木造回復所': 'Wooden Aid Station', '石造回復所': 'Stone Aid Station', '軍医療養所': 'Military Infirmary', '総合回復院': 'General Recovery Hospital', '野戦病院': 'Field Hospital', '軍病院': 'Military Hospital', '中央医療院': 'Central Medical Institute',
    '前線兵舎': 'Frontline Barracks', '石造前線兵舎': 'Stone Frontline Barracks', '青銅前線兵舎': 'Bronze Frontline Barracks', '鉄器前線兵舎': 'Iron Frontline Barracks', '鋼鉄前線兵舎': 'Steel Frontline Barracks', '機械化前線兵舎': 'Mechanized Frontline Barracks', '前線司令所': 'Frontline Command Post',
    '木製測量塔': 'Wooden Survey Tower', '石造測量塔': 'Stone Survey Tower', '青銅測量塔': 'Bronze Survey Tower', '鉄製測量塔': 'Iron Survey Tower', '鋼鉄測量塔': 'Steel Survey Tower', '信号測量所': 'Signal Survey Station', '道路網測量局': 'Road Network Survey Bureau',

    '経路制御': 'Route control', '選択的経路制御': 'Selective route control', '単体攻撃': 'Single-target attack', '範囲攻撃': 'Area attack', '減速支援': 'Slow support', '自動修復': 'Auto repair', '範囲回復': 'Area healing', '前線部隊枠': 'Frontline squad slots', '道路測量': 'Road surveying',
    '防壁': 'Wall', '門': 'Gate',
    '道路を封鎖し、敵部隊の進行経路を変える防衛設備です。': 'A defense facility that blocks road sections and changes enemy movement routes.',
    '敵と味方の双方を完全に遮断します。通行可能な別経路がある部隊は迂回するため、敵の誘導に使えますが、味方の出撃路も塞ぎます。': 'Completely blocks both enemies and allies. Units with another passable route will detour, so it can guide enemies but may also block allied dispatch routes.',
    '建設可能範囲内に表示される道路区間へ、1区間につき1基設置します。近接・重複する道路区間には重ねて設置できません。': 'Build one per displayed road section inside construction range. Overlapping or very close sections cannot be stacked.',
    '味方の通行を維持しながら敵部隊を足止めする、開閉可能な防衛門です。': 'A gate that keeps allied passage open while holding enemies back.',
    '敵は別経路があれば迂回し、なければ門を攻撃します。味方用の開閉機構を持つため同Tierの防壁より耐久は低く、破壊されると道路が開通します。': 'Enemies detour if another route exists; otherwise they attack the gate. Its allied passage mechanism makes it less durable than same-tier walls, and the road opens when destroyed.',
    '既設の防壁を文明Lv.2以降で門へ変換し、以後は文明Tierに合わせて強化します。': 'Convert an existing wall into a gate from Civ Lv.2 onward, then upgrade it by civilization tier.',
    '射程内で最も近い敵を継続攻撃する基本防衛塔です。': 'A basic tower that repeatedly attacks the nearest enemy in range.',
    '短い再装填で単体へ安定した損害を与えます。敵が長く射程内に留まる交差点が有効です。': 'Deals steady single-target damage with a short reload. Intersections where enemies stay in range are effective.',
    '建設可能範囲内に表示される交差点・終端・重要な曲がり角・一本道の補完地点へ設置します。': 'Build at displayed intersections, endpoints, important bends, and supplemental straight-road points inside construction range.',
    '敵が密集した地点を狙い、爆発範囲内の複数目標へ攻撃します。': 'Targets dense enemy clusters and damages multiple targets in the blast radius.',
    '中心目標へ最大ダメージ、周辺へ減衰ダメージを与えます。同時命中数には上限があり、防壁や減速設備の後方が有効です。': 'Deals full damage to the center target and reduced splash damage nearby. Hit count is capped, so it works well behind walls or slow facilities.',
    '射程内の複数の敵を減速させ、ほかの設備が攻撃できる時間を延ばします。': 'Slows multiple enemies in range, giving other defenses more time to attack.',
    '対象へ小ダメージと一定時間の移動速度低下を与えます。攻撃塔の射程が重なる地点で効果が高まります。': 'Deals minor damage and slows movement for a time. It is stronger where attack tower ranges overlap.',
    '射程内で損傷が最も大きい防衛設備を自動修復します。': 'Automatically repairs the most damaged defense in range.',
    '修復時には対象設備に応じた資源を消費します。前線設備を範囲内へ収める配置が必要です。': 'Repairs consume resources based on the target facility. Place it so frontline defenses are inside range.',
    '建設可能範囲内に表示される代表的な支援地点へ設置します。': 'Build at representative support points inside construction range.',
    '周囲にいる味方部隊を、滞在している間だけ徐々に回復する施設です。': 'Gradually heals allied squads that remain nearby.',
    '帰還中・待機中・交戦前後を問わず、射程内の生存部隊を同時に回復します。施設が停止中または破壊された場合は回復しません。': 'Heals all surviving squads in range, whether returning, waiting, or between engagements. It does not heal while disabled or destroyed.',
    '主要拠点・簡易拠点・遠征部隊の建設範囲内へ、各建設基準点につき1基まで設置できます。': 'Build within major base, simple base, or expedition squad construction range, up to one per construction anchor.',
    '簡易拠点から運用できる部隊枠を、施設Tierに応じて増やす前線兵舎です。': 'A frontline barracks that increases squad slots available from a simple base by facility tier.',
    '設置された簡易拠点の部隊上限だけを増やします。施設停止中も既存部隊は消えませんが、追加枠を使った新規派兵はできません。': 'Only increases the squad limit of the simple base where it is placed. Existing squads remain if it is disabled, but new dispatch using the extra slots is unavailable.',
    '簡易拠点の建設範囲内へ、各拠点1基まで設置できます。': 'Build within simple base construction range, one per base.',
    '拠点周辺の未取得道路チャンクを時間をかけてMAPへ追加する探索支援設備です。': 'An exploration support facility that gradually adds unacquired road chunks around a base to the map.',
    '拠点周辺の道路形状を時間をかけてMAPへ追加します。敵基地・道端物資・現地イベントの正確な位置は、プレイヤーが現地へ移動するまで表示しません。': 'Gradually adds road geometry around a base to the map. Exact enemy base, roadside supply, and local event locations are not shown until the player travels there.',

    '現在文明': 'Current civilization', '次の目標': 'Next goal', '拠点上限': 'Base limits', '建設枠': 'Building slots', '主要': 'Major', '簡易': 'Simple',
    '発展': 'Growth', '資源': 'Resources', '施設': 'Facilities', '生産': 'Production', '解禁': 'Unlocks',
    '文明画面の表示切替': 'Civilization tab switcher', '文明発展': 'Civilization Growth', '資源一覧': 'Resource List', '集落施設': 'Settlement Facilities', '防衛設備Tier': 'Defense Facility Tiers', '派兵部隊': 'Dispatch Squads',
    '最高文明へ到達しています。': 'Maximum civilization reached.', '保有資源はありません。': 'No stored resources.', '状態：': 'Status: ', '残り': 'remaining', '条件達成': 'conditions complete',
    '準備中': 'Preparing', '納入中': 'Delivering', '建設開始可能': 'Ready to build', '建設中': 'Building', '一時停止': 'Paused',
    '不足している条件': 'Missing requirements', '達成済み条件': 'Completed requirements', '現在の発展条件はすべて達成済みです。': 'All current development requirements are complete.', '達成済み条件はまだありません。': 'No completed requirements yet.',
    '基本資源だけ予備を残して一括納入': 'Deliver only basic resources with reserves', '不足分を予備を残して一括納入': 'Deliver shortages while keeping reserves', '予備を残す': 'Keep reserves', '全量納入': 'Deliver all', '納入を戻す': 'Withdraw deliveries', '建設開始': 'Start construction',
    '不足': 'Missing', '防衛予備': 'Defense reserve', '必要量を納入済みです。': 'Required amount delivered.', '所持分を納入できます。': 'You can deliver stored resources.', '防衛・建設用に': 'You can keep ', 'を残して納入できます。': ' for defense and construction.', 'があと': ' needs ', '必要です。': ' more.',
    '倉庫・保管': 'Storage', '同じ倉庫を複数建てても建設枠は1枠として扱い、保管上限の増加効果は合計表示します。': 'Multiple storehouses of the same type use one building slot, and their capacity bonuses are shown as a total.',
    '倉庫効果': 'Storage Effects', '倉庫系施設は未建設です。': 'No storage facilities built.', '倉庫系施設はまだ解放されていません。': 'Storage facilities are not unlocked yet.', '稼働中の倉庫': 'Active Storehouses', '稼働': 'Active', '基': '', '建設枠 1': '1 building slot', '全基稼働': 'all active', '損傷': 'damaged', '保管上限の増加なし': 'No storage capacity increase',
    '所有': 'Owned', '費用': 'Cost', '効果：': 'Effect: ', '建設': 'Build', '未解禁': 'Locked', '上限': 'Limit', '枠不足': 'No slot', '資源不足': 'Resources short', '不明な施設です。': 'Unknown facility.', '建設上限に達しています。': 'Build limit reached.', '集落の建設枠がありません。': 'No settlement building slot available.', '不足：': 'Missing: ', '建設できます。': 'Can build.',
    '生産・加工': 'Production / Processing', '生産施設はまだ解放されていません。': 'Production facilities are not unlocked yet.', '加工・精錬を行う稼働施設だけ表示します。倉庫は資源・施設タブで合計効果を確認します。': 'Only active processing and smelting facilities are shown. Check storage totals in the Resources and Facilities tabs.', '稼働中の生産施設はまだありません。': 'No active production facilities yet.',
    '耐久': 'HP', '待機中': 'Idle', '資源待ち': 'Waiting for resources', '予約残': 'queued', '未回収': 'Uncollected', '未回収品を回収': 'Collect output', '修理': 'Repair', '解体': 'Dismantle', '稼働レシピ未解禁': 'No active recipe unlocked', '投入資材が不足しています。': 'Input resources are insufficient.', '投入': 'Input', '完成': 'Output', '発展計画へ優先納入': 'delivered to development plan first', '最大': 'Max',
    '現在は主要拠点': 'Current major base', '枠、簡易拠点': ' slots, simple base ', '枠、全体指揮': ' slots, global command ', 'です。簡易拠点からは突撃部隊・遊撃部隊・回収部隊を派兵できます。': '. Simple bases can dispatch Assault, Skirmisher, and Recovery squads.',
    '文明レベルと同じTierまでMAP上の既設設備を個別に強化できます。': 'Existing map defenses can be upgraded individually up to the tier matching civilization level.', '現在は利用できません': 'Currently unavailable', '強化上限 Tier': 'Upgrade cap Tier', '次：': 'Next: ', '最終Tier解禁済み': 'Final tier unlocked',

    '出撃札は出撃タブで対象を選んでから使用します。': 'Dispatch tickets are used from the Dispatch tab after choosing a target.',
    'ITEMS // 物資': 'ITEMS', '周辺の道端物資なし': 'No nearby roadside supplies', '周辺': 'Nearby', '装備': 'Gear', '消耗品インベントリ': 'Consumable Inventory', '所持品': 'Inventory', '出撃': 'Dispatch', '誘導': 'Guide', '製作': 'Craft', '素材': 'Materials', '消耗品': 'Consumables', '戦術素材': 'Tactical Materials', '周辺物資': 'Nearby Supplies', '所持数合計': 'Total items', '製作用素材': 'Crafting materials', '取得済み': 'Collected', 'レア取得': 'Rare collected',
    '現在地周辺に表示中の道端物資はありません。': 'No visible roadside supplies near your current position.', '消耗品インベントリ': 'Consumable Inventory', '出撃札は出撃タブで対象を選んでから使用します。使用すると一時部隊がその対象へ出撃します。': 'Dispatch tickets are used from the Dispatch tab after selecting a target. Using one sends a temporary squad to that target.',
    '以内の出撃先を選び、一時部隊を派遣': ' range: choose a target and send a temporary squad', '現在地': 'Current position ', '以内の通常敵を掃討': ' range: sweep normal enemies', '以内の敵拠点1つを破壊': ' range: destroy one enemy base', '道路上に設置。時間制限なし・発動まで残存': 'Place on a road. No time limit; remains until triggered.', '下の誘導先リストから地雷または防衛密集地点を指定': 'Choose a mine or dense defense point from the guidance target list below.', '敵部隊または敵拠点を選択すると下部操作に表示されます': 'Appears in the lower actions after selecting an enemy squad or enemy base.', '味方部隊を選択すると下部操作に表示されます': 'Appears in the lower actions after selecting an allied squad.', '対象不要の消耗品': 'Consumable that does not require a target.',
    '出撃先を選ぶ': 'Choose target', '部隊選択後に使用': 'Use after selecting squad', '対象選択後に使用': 'Use after selecting target', '誘導先を選ぶ': 'Choose guidance target', 'すぐ使用': 'Use now',
    '出撃札の出撃先': 'Dispatch Ticket Targets', '突撃・遊撃・攻城の各出撃札は、ここで対象を選んで一時部隊を派遣します。対象ごとに距離・経路・HPを確認できます。': 'Choose targets here for Assault, Skirmisher, and Siege tickets. Each target shows distance, route, and HP.',
    '経路': 'Route', '経路なし': 'No route', '接続不可': 'Not connected', 'この対象へ出撃': 'Dispatch to this target', '現在地から': 'From current position, ', '以内に出撃可能な対象がありません。': ' no valid dispatch target is in range.', 'を所持していません。': ' not owned.', '遊撃部隊が選択した敵部隊へ向かいます。': 'The skirmisher squad moves toward the selected enemy squad.', '選択した敵拠点': 'The selected enemy base', '選択した敵': 'The selected enemy', 'へ一時部隊を向かわせます。': ' receives a temporary squad.', '一時部隊は同時に1隊までです。': 'Only one temporary squad can be active at once.',
    '誘導信号の誘導先': 'Guidance Signal Targets', '設置済み地雷または防衛設備の密集地点へ、一定時間だけ敵の目標を寄せます。地雷へ誘導した敵が踏むと高い損害を与えます。': 'For a limited time, pulls enemy targets toward placed mines or dense defense points. Enemies guided onto mines take heavy damage.', '設置済み地雷': 'Placed mine', '防衛密集地点': 'Dense defense point', '撤去': 'Remove', '誘導信号': 'Guidance signal', '誘導先になる設置済み地雷・防衛密集地点がありません。': 'No placed mine or dense defense point is available as a guidance target.',
    '戦術工房': 'Tactical Workshop', '資源と戦術素材を使って、地雷・誘導信号・遠隔支援・出撃札を製作できます。': 'Use resources and tactical materials to craft mines, guidance signals, remote support, and dispatch tickets.', '文明Lv.4以降で戦術工房を建設すると、この画面で戦術アイテムを製作できます。': 'Build a Tactical Workshop from Civ Lv.4 onward to craft tactical items here.', '製作可能': 'Craftable', '現在すぐ製作できるアイテムはありません。': 'No item can be crafted right now.', '素材不足・未解禁レシピ': 'Missing materials / Locked recipes', '未解禁または資源不足のレシピはありません。': 'No locked or resource-short recipes.', '必要資源がそろっています。': 'Required resources are available.', '戦術工房を建設すると製作できます。': 'Build a Tactical Workshop to craft this.', 'レア以上の道端物資から入手し、戦術アイテムの製作に使います。': 'Obtained from rare or better roadside supplies and used to craft tactical items.', '戦術素材はまだありません。レア以上の道端物資から入手します。': 'No tactical materials yet. Obtain them from rare or better roadside supplies.', '素材': 'Material', '資材': 'Resources',
    '道端物資': 'Roadside Supplies', '道路沿いの資源箱は近づくと自動回収します。保管上限を超える資源は取得されません。': 'Resource crates along roads are collected automatically when approached. Resources above storage capacity are not obtained.',

    '拠点画面の表示切替': 'Base tab switcher', '概要': 'Overview', '主要拠点': 'Major Bases', '簡易拠点': 'Simple Bases', '主要拠点': 'Major Base', '簡易拠点': 'Simple Base', '各': 'each ', '部隊枠': 'squad slots', '文明': 'Civilization', '発展で拠点・部隊枠が増加': 'Growth increases base and squad slots', '拠点概要': 'Base Overview', '稼働中の主要拠点がありません。': 'No active major bases.', '簡易拠点はまだありません。': 'No simple bases yet.', 'すべての部隊を派兵できる中核拠点です。主要拠点は最低1つを残し、それ以外は撤去できます。': 'Core bases that can dispatch all squad types. At least one major base must remain; the rest can be dismantled.', '突撃部隊・遊撃部隊・回収部隊の前線運用に使います。不要な簡易拠点は撤去できます。': 'Used for frontline operation of Assault, Skirmisher, and Recovery squads. Unneeded simple bases can be dismantled.', 'この拠点をMAP表示': 'Show this base on MAP', '現地で': 'Rebuild on site: ', 'を再建': ' rebuild', 'を撤去': ' dismantle', '撤去すると拠点枠を空け、対象中の敵と部隊は残存主要拠点へ再割当します。': 'Dismantling frees a base slot and reassigns enemies and squads targeting it to a remaining major base.', '撤去できません。': 'Cannot dismantle.', '現地へ移動してください。': 'Move to the site.', '現在地から再建できます。': 'Can rebuild from your current location.', '破壊': 'Destroyed', '交戦警戒': 'Enemy contact', '回収物あり': 'Recovery item nearby', '安定': 'Stable', '同時標的上限': 'simultaneous target cap', '制限なし': 'unlimited', '派兵中': 'Deployed', '回復中': 'Recovering', '再出撃待機': 'Ready to redeploy', '周辺に未回収アイテム': 'Unrecovered nearby items', '要修理': 'Repairs needed', '表示': 'Focused', '主要拠点を再建できません。': 'Cannot rebuild major base.', '簡易拠点を再建できません。': 'Cannot rebuild simple base.', '主要拠点を撤去できません。': 'Cannot dismantle major base.', '簡易拠点を撤去できません。': 'Cannot dismantle simple base.', '拠点を設置できません。': 'Cannot place base.', '簡易拠点を設置できません。': 'Cannot place simple base.', 'を設置しました。': ' placed.', 'を再建しました。': ' rebuilt.', 'を撤去しました。': ' dismantled.',     '現在地に主要拠点': 'Build a major base here', '現在地に簡易拠点': 'Build a simple base here', '建設範囲': 'Construction range ', 'すべての部隊を派兵できます。': 'All squad types can be dispatched.', '現在地に主要拠点を設置': 'Place major base here', '現在地に簡易拠点を設置': 'Place simple base here', '設置可能': 'Can place', '道路まで約': 'about ', '道路網診断': 'Road network check', '追加候補': 'Additional candidates', '破壊済み': 'Destroyed', '文明Lv.1で解禁。取得済み道路の交差点から100m以内で設置できます。': 'Unlocked at Civ Lv.1. Can be placed within 100 m of an acquired road intersection.',

    '建設範囲': 'Construction range ', '突撃／遊撃／回収部隊を派兵可能': 'Can dispatch Assault, Skirmisher, and Recovery squads',
    '本拠地': 'Home Base', '主要拠点 2': 'Major Base 2', '主要拠点 3': 'Major Base 3', '主要拠点 4': 'Major Base 4', '簡易拠点 1': 'Simple Base 1', '簡易拠点 2': 'Simple Base 2', '簡易拠点 3': 'Simple Base 3',
    '敵圧': 'Enemy pressure', '未認識': 'Unrecognized', '偵察': 'Scouting', '小規模': 'Minor', '拡大中': 'Escalating', '本格': 'Full', '本格化まで約': 'about ', '同時標的上限': 'simultaneous target cap',
    '破壊された簡易拠点から50m以内へ移動してください。': 'Move within 50 m of the destroyed simple base.',
    '破壊された主要拠点から220m以内へ移動してください。': 'Move within 220 m of the destroyed major base.',
    '現在の取得道路上に、あと0基分の設置候補を確認しました。': 'The acquired road network has 0 additional candidate sites.',
    '現在の取得道路上に、あと1基分の設置候補を確認しました。': 'The acquired road network has 1 additional candidate site.',
    '現在の取得道路上に、あと2基分の設置候補を確認しました。': 'The acquired road network has 2 additional candidate sites.',
    '現在の取得道路上に、あと3基分の設置候補を確認しました。': 'The acquired road network has 3 additional candidate sites.',
    '設置枠は埋まっています。破壊済み簡易拠点を現地で再建してください。': 'No base slots are available. Rebuild destroyed simple bases on site.',
    '現在の取得道路では必要数に届きません。道路をさらに取得するか、敵拠点周辺を制圧してください。': 'The acquired road network does not contain enough sites. Acquire more roads or secure areas around enemy bases.',
    '必要数の簡易拠点はすでに稼働しています。': 'The required number of simple bases is already active.',

    '保存に失敗しました。': 'Save failed.',
    '保存機能を利用できません。このタブを閉じると進行状況は失われます。': 'Saving is unavailable. Progress will be lost if this tab is closed.',
    '起動に失敗しました。ページを再読み込みしてください。': 'Startup failed. Reload the page.',
    'FRONTLINE ROADSの起動に失敗しました。ページを再読み込みしてください。': 'FRONTLINE ROADS failed to start. Reload the page.',
    '表示できる拠点がありません。': 'No base can be shown.',
    '保存データを復元できなかったため、新しいゲームとして開始します。破損データは無効化しました。': 'Save data could not be restored, so a new game will start. The damaged data was disabled.',
    '保存データを復元できなかったため、新しいゲームとして開始します。': 'Save data could not be restored, so a new game will start.',
    '道路キャッシュを復元できませんでした。保存済みの進行データで続行します。': 'Road cache could not be restored. Continuing with saved progress data.',
    '不在中の進行計算を適用できませんでした。保存時点から再開します。': 'Offline progress could not be applied. Resuming from the saved point.',
    '別のタブがゲーム進行を担当しています。そちらを閉じると、このタブで開始できます。': 'Another tab is running game progress. Close it to start from this tab.',
    '別のタブがゲーム進行を担当しています。': 'Another tab is running game progress.',
    '別のタブが進行を担当しています。このタブは閲覧専用です。': 'Another tab is running progress. This tab is read-only.',
    '別のタブが進行を引き継ぎました。': 'Another tab took over progress.',
    'このタブで進行を再開しました。': 'Progress resumed in this tab.',
    '保存データを初期化できませんでした。': 'Save data could not be reset.',
    '位置情報を取得しています…': 'Getting location…',
    '現在地周辺の道路を取得しています…': 'Loading roads near your current location…',
    '中心部道路': 'core roads',
    '全道路': 'all roads',
    '道路地図を構築しています…': 'Building the road map…',
    '初期化に失敗しました。': 'Initialization failed.',
    '詳細': 'Details',
    '周辺道路を確認しています。完了後に拠点を確定できます。': 'Checking nearby roads. You can confirm the base after this completes.',
    '中心部の道路で開始できます。開始地点を選んで拠点を確定してください。周辺道路は移動や測量施設で追加されます。': 'You can start on core-area roads. Select a start point and confirm the base. Nearby roads are added by movement and survey facilities.',
    '拠点を設置しました。まず投石台2基を建設し、敵拠点へ部隊を派兵してください。移動すると周辺道路を順次偵察し、MAPへ追加します。': 'Base placed. First build two Stone Throwers, then deploy squads to enemy bases. As you move, nearby roads are scouted and added to the map.',
    '選択地点周辺の道路を確認しています…': 'Checking roads around the selected point…',
    '選択地点周辺の道路を取得できませんでした。通信状態を確認して、もう一度確定してください。': 'Could not load roads around the selected point. Check the connection and confirm again.',
    '道路更新後に選択地点を確認できませんでした。道路を選び直してください。': 'The selected point could not be verified after the road update. Select a road again.',
    '拠点の設置に失敗しました。': 'Failed to place the base.',
    '位置追跡': 'Location tracking',
    '分進行': 'minutes advanced',
    '撃破': 'defeated',
    '都市被害': 'city damage',
    '防衛設備損失': 'Defense facilities lost',
    '集落施設損失': 'Settlement facilities lost',
    '長時間分は上限適用': 'Long-duration cap applied',
    '不在中の進行': 'Offline progress',
    '復帰時の読み込みが完了しませんでした。再読み込みすると保存済みのゲームから復帰します。': 'Resume loading did not complete. Reload to restore the saved game.',
    '復帰時の表示データを読み込めませんでした。再読み込みすると保存済みのゲームから復帰します。': 'Display data could not be loaded during resume. Reload to restore the saved game.',

    '表示品質：高精細': 'Display quality: Full',
    '表示品質：標準': 'Display quality: Standard',
    '表示品質：省電力': 'Display quality: Power saving',
    'アニメーション：ON': 'Animation: ON',
    'アニメーション：OFF': 'Animation: OFF',
    '地図を拡大': 'Zoom in',
    '地図を縮小': 'Zoom out',
    '選択中の拠点へ移動': 'Go to selected base',
    '現在地へ移動': 'Go to current location',
    '拠点設置済み': 'Base placed',
    '拠点設置完了': 'Base placement complete',
    '保存済み拠点': 'Saved base',
    '初回現在地から約': 'about ',
    '現在地から': 'from current location ',
    '現在地': 'Current position',
    '中心部': 'core area',
    '周辺': 'nearby',

    '選択した道路が見つかりません。': 'The selected road was not found.',
    '位置情報が古いため簡易拠点を設置できません。現在地を再取得してください。': 'Location data is too old to place a simple base. Refresh your current location.',
    '位置情報が古いため拠点を設置できません。現在地を再取得してください。': 'Location data is too old to place a base. Refresh your current location.',
    '文明Lv.1で簡易拠点が解禁されます。': 'Simple bases unlock at Civ Lv.1.',
    '簡易拠点の設置資源が不足しています。': 'Not enough resources to place a simple base.',
    '簡易拠点が見つかりません。': 'Simple base not found.',
    'この簡易拠点は稼働中です。': 'This simple base is active.',
    '簡易拠点が接続していた道路を利用できません。': 'The road connected to the simple base is unavailable.',
    '簡易拠点の再建資源が不足しています。': 'Not enough resources to rebuild the simple base.',
    '撤去する簡易拠点が見つかりません。': 'The simple base to dismantle was not found.',
    '主要拠点の設置資源が不足しています。': 'Not enough resources to place a major base.',
    '再建対象の主要拠点が見つかりません。': 'The major base to rebuild was not found.',
    'この主要拠点は稼働中です。': 'This major base is active.',
    '位置情報が古いため再建できません。': 'Location data is too old to rebuild.',
    '主要拠点の再建資源が不足しています。': 'Not enough resources to rebuild the major base.',
    '最後に残す主要拠点は撤去できません。': 'The last remaining major base cannot be dismantled.',
    '主要拠点は最低1つ必要です。': 'At least one major base is required.',
    '撤去する主要拠点が見つかりません。': 'The major base to dismantle was not found.',
    '文明レベルに対する拠点上限へ到達しています。': 'The civilization-level base limit has been reached.',

    '設備が見つかりません。': 'Facility not found.',
    '最高Tierへ到達しています。': 'Maximum tier reached.',
    '破壊された設備は撤去済みです。': 'Destroyed facilities have already been removed.',
    '強化資源が不足しています。': 'Not enough resources to upgrade.',
    'この施設では現在生産できません。': 'This facility cannot currently produce.',
    '未予約の資源では追加生産できません。': 'Additional production cannot use unreserved resources.',
    '施設が見つかりません。': 'Facility not found.',
    '回収できる生産物はありません。': 'No products can be collected.',
    '現在は納入できません。': 'Resources cannot be delivered right now.',
    '納入できる資源がありません。': 'No resources can be delivered.',
    '建設開始後は引き出せません。': 'Resources cannot be withdrawn after construction starts.',
    '発展条件を満たしていません。': 'Development requirements are not met.',

    '敵圧 不明': 'Enemy pressure unknown',
    '不明': 'Unknown',
    '巡回部隊': 'Patrol Squad',
    '工作部隊': 'Saboteur Squad',
    '突破部隊': 'Breakthrough Squad',
    '未確認の敵性反応': 'Unidentified hostile signal',
    '未踏破の道路方面から敵部隊が侵入しました。進入方向を確認してください。': 'Enemy squads entered from an unexplored road direction. Check the entry direction.',
    '敵拠点': 'Enemy base',
    '敵部隊': 'Enemy squad',
    '対象': 'Target',
    '前哨基地': 'Outpost',
    '兵舎基地': 'Barracks base',
    '採掘基地': 'Mining base',
    '攻城基地': 'Siege base',
    '装甲基地': 'Armored base',

    '敵指揮認証鍵': 'Enemy Command Auth Key',
    '敵部隊の指揮系統に使われていた認証鍵です。': 'An authentication key used by the enemy command system.',
    '攻城機構コア': 'Siege Mechanism Core',
    '工兵設備と攻城装置の制御中枢です。': 'The control core for engineer facilities and siege devices.',
    '暗号通信モジュール': 'Encrypted Communication Module',
    '敵拠点間の暗号通信を保持しています。': 'Stores encrypted communications between enemy bases.',
    '装甲制御コア': 'Armor Control Core',
    '装甲部隊の製造・整備情報を含む中枢部品です。': 'A core component containing armor squad manufacturing and maintenance data.',
    '資源調査データ': 'Resource Survey Data',
    '採掘拠点が蓄積した地域資源データです。': 'Regional resource data accumulated by a mining base.',
    '攻城作戦記録': 'Siege Operation Record',
    '攻城兵器と侵攻経路の作戦記録です。': 'Operation records for siege weapons and invasion routes.',
    '回収部隊移動中': 'Recovery squad en route',
    '回収部隊が到着するまで、破壊地点に残っています。': 'Remains at the destroyed site until the recovery squad arrives.',
    '搬送中': 'In transit',
    '回収部隊が回収物を持ち帰っています。拠点到着後に資源と実績へ反映されます。': 'The recovery squad is carrying the item back. It is added to resources and achievements after reaching base.',
    '現地回収または回収部隊の派遣が可能です。': 'Local recovery or recovery squad dispatch is available.',
    '回収済み': 'Recovered',
    'この回収物は既に処理されています。': 'This recovery item has already been processed.',
    'この回収物は現在利用できません。': 'This recovery item is not currently available.',
    'プレイヤーが現地回収を開始しています。': 'The player is starting local recovery.',
    '回収物の予約状態が失われています。': 'The recovery item reservation state was lost.',
    '回収物を解放できません。': 'Recovery item cannot be released.',
    '回収物が見つかりません。': 'Recovery item not found.',
    '部隊が回収物を所持していません。': 'The squad is not carrying a recovery item.',
    'この回収物は回収部隊が対応中、または取得済みです。': 'This recovery item is being handled by a recovery squad or has already been obtained.',
    '最新の位置情報を取得してください。': 'Get the latest location data.',
    '別の回収作業を中断してから開始してください。': 'Cancel the other recovery operation before starting.',

    '補給物資': 'Supply Cache',
    '資源箱': 'Resource Crate',
    '戦術工房の製作素材': 'Crafting material for the Tactical Workshop',
    '現地装備': 'Field Gear',
    '消耗品インベントリへ追加': 'Added to consumable inventory',
    '不明な製作です。': 'Unknown crafting recipe.',
    '戦術工房が必要です。': 'A Tactical Workshop is required.',
    '製作素材が不足しています。': 'Not enough crafting materials.',
    '木材箱': 'Wood crate', '石材袋': 'Stone bag', '繊維束': 'Fiber bundle',
    '加工木材箱': 'Timber crate', '縄束': 'Rope bundle', '切石箱': 'Cut stone crate', '木炭袋': 'Charcoal bag',
    '銅鉱石箱': 'Copper ore crate', '錫鉱石箱': 'Tin ore crate', '鉄鉱石箱': 'Iron ore crate',
    '青銅塊箱': 'Bronze ingot crate', '鍛鉄箱': 'Wrought iron crate', '鋼材箱': 'Steel crate', '機構部品箱': 'Mechanism parts crate',

    '主要拠点で補給・再編成': 'Resupply and reorganization at major base',
    '簡易拠点で再編成': 'Reorganization at simple base',
    '再編成可能な拠点がありません。': 'No base is available for reorganization.',
    '簡易拠点で待機': 'Waiting at simple base',
    '補給・回復・再編成': 'resupply, healing, and reorganization',
    '再編成': 'reorganization',
    '撤退経路を確保できません。': 'Retreat route cannot be secured.',
    '味方部隊が指定地点まで後退し、停止しました。': 'The friendly squad retreated to the specified point and stopped.',
    '遊撃部隊が不利な敵群から自動後退しました。': 'The Skirmisher Squad automatically retreated from an unfavorable enemy group.',
    '工兵部隊を選択してください。': 'Select an Engineer Squad.',
    '出撃中の工兵部隊だけが現地修復できます。': 'Only a deployed Engineer Squad can perform field repairs.',
    '現地修復に必要な資源が不足しています。': 'Not enough resources for field repair.',
    '現地修復の確定時に資源が不足しました。': 'Resources were insufficient when field repair was confirmed.',
    '回収部隊が壊滅し、特殊アイテムが道路上へ残されました。': 'The Recovery Squad was wiped out, leaving the special item on the road.',
    '現地出撃部隊が壊滅し、特殊アイテムが道路上へ残されました。': 'The field dispatch squad was wiped out, leaving the special item on the road.',
    '部隊が主要拠点へ帰還し、補給・回復・再編成を開始しました。': 'The squad returned to a major base and started resupply, healing, and reorganization.',
    '部隊が簡易拠点へ帰還し、再編成を開始しました。回復には回復施設の範囲内での待機が必要です。': 'The squad returned to a simple base and started reorganization. Healing requires waiting within range of a healing facility.',
    '最短': 'Shortest', '敵回避': 'Avoid enemies', '味方援護': 'Ally support',
    '撤退': 'Retreat', '進軍再開': 'Resume advance',

    '件': '', '範囲内の全味方': 'all allies in range', '拠点ごと1基': 'one per base', '簡易拠点ごと1基': 'one per simple base', '1区間': '1 section'
  })
});

const INLINE_COPY_PATTERNS = Object.freeze({
  en: Object.freeze([
    [/破壊された簡易拠点から(\d+)m以内へ移動してください。/g, (_match, meters) => `Move within ${meters} m of the destroyed simple base.`],
    [/破壊された主要拠点から(\d+)m以内へ移動してください。/g, (_match, meters) => `Move within ${meters} m of the destroyed major base.`],
    [/現在の取得道路上に、あと(\d+)基分の設置候補を確認しました。/g, (_match, count) => `The acquired road network has ${count} additional candidate site(s).`],
    [/破壊済み簡易拠点を(\d+)基再建すると条件を満たせます。/g, (_match, count) => `Rebuild ${count} destroyed simple base(s) to meet the requirement.`],
    [/現在の文明レベルでは簡易拠点を(\d+)個まで設置できます。/g, (_match, count) => `Current civilization level allows up to ${count} simple bases.`],
    [/現在の文明レベルでは拠点を(\d+)個まで設置できます。/g, (_match, count) => `Current civilization level allows up to ${count} major bases.`],
    [/取得済み道路の交差点から(\d+)m以内へ移動してください。/g, (_match, meters) => `Move within ${meters} m of an acquired road intersection.`],
    [/既存拠点から(\d+)m以上離れてください。/g, (_match, meters) => `Move at least ${meters} m away from an existing base.`],
    [/簡易拠点から(\d+)m以上離れてください。/g, (_match, meters) => `Move at least ${meters} m away from a simple base.`],
    [/敵拠点から(\d+)m以上離れてください。/g, (_match, meters) => `Move at least ${meters} m away from an enemy base.`],
    [/起動に失敗しました：(.+)/g, (_match, details) => `Startup failed: ${details}`],
    [/(.+)を道路サーバーから取得しています… (.+) \((\d+)\/(\d+), 試行 (\d+)\/(\d+)\)/g, (_match, label, transport, index, total, attempt, totalAttempts) => `Loading ${copyText('en', label)} from the road server… ${transport} (${index}/${total}, attempt ${attempt}/${totalAttempts})`],
    [/(中心部|周辺)道路を解析しています…/g, (_match, area) => `Parsing ${area === '中心部' ? 'core area' : 'nearby'} roads…`],
    [/拠点設置完了：初回現在地から約(\d+)m/g, (_match, meters) => `Base placement complete: about ${meters} m from the initial location`],
    [/保存済み拠点：初回現在地から約(\d+)m/g, (_match, meters) => `Saved base: about ${meters} m from the initial location`],
    [/(\d+)分進行/g, (_match, minutes) => `${minutes} min advanced`],
    [/撃破 (\d+)/g, (_match, count) => `Defeated ${count}`],
    [/都市被害 (\d+)/g, (_match, damage) => `City damage ${damage}`],
    [/防衛設備損失 (\d+)/g, (_match, count) => `Defense facilities lost ${count}`],
    [/集落施設損失 (\d+)/g, (_match, count) => `Settlement facilities lost ${count}`],
    [/文明 \+(\d+)/g, (_match, count) => `Civilization +${count}`],
    [/敵圧 (.+)・(\d+)%・本格化まで約(\d+)時間/g, (_match, stage, percent, hours) => `Enemy pressure ${copyText('en', stage)} · ${percent}% · about ${hours} h until full escalation`],
    [/現在の文明レベルでは簡易拠点を(\d+)個まで設置できます。/g, (_match, count) => `Current civilization level allows up to ${count} simple bases.`],
    [/現在の文明レベルでは拠点を(\d+)個まで設置できます。/g, (_match, count) => `Current civilization level allows up to ${count} major bases.`],
    [/破壊済み簡易拠点を(\d+)基再建すると条件を満たせます。/g, (_match, count) => `Rebuild ${count} destroyed simple base(s) to meet the requirement.`],
    [/現在の取得道路上に、あと(\d+)基分の設置候補を確認しました。/g, (_match, count) => `The acquired road network has ${count} additional candidate site(s).`],
    [/回収地点の(\d+)m以内へ移動してください。/g, (_match, meters) => `Move within ${meters} m of the recovery point.`],
    [/周囲(\d+)mに修復可能な設備がありません。/g, (_match, meters) => `No repairable facility within ${meters} m.`],
    [/半径(\d+)m以内に撤退可能な味方部隊がありません。/g, (_match, meters) => `No friendly squad can retreat within ${meters} m.`],
    [/半径(\d+)m以内に加速可能な味方部隊がありません。/g, (_match, meters) => `No friendly squad can be accelerated within ${meters} m.`],
    [/半径(\d+)m以内に破壊可能な敵拠点がありません。/g, (_match, meters) => `No destructible enemy base within ${meters} m.`],
    [/(.+)で部隊の(.+)が完了しました。/g, (_match, base, completion) => `${copyText('en', base)} completed squad ${copyText('en', completion)}.`],
    [/(.+)へ発展しました。/g, (_match, name) => `Advanced to ${copyText('en', name)}.`],
    [/(.+)が破壊されました。現地で再建できます。/g, (_match, name) => `${copyText('en', name)} was destroyed. It can be rebuilt on site.`],
    [/(.+)周辺で(.+)が活動を開始しました。/g, (_match, anchor, name) => `${copyText('en', name)} started operating around ${copyText('en', anchor)}.`],
    [/(.+)の脅威レベルがLv\.(\d+)へ上昇しました。/g, (_match, name, level) => `${copyText('en', name)} threat level rose to Lv.${level}.`],
    [/(.+)を取得しました。戦術工房で使用できます。/g, (_match, name) => `${copyText('en', name)} obtained. It can be used at the Tactical Workshop.`],
    [/(.+)を取得しました。ITEMSから使用できます。/g, (_match, name) => `${copyText('en', name)} obtained. It can be used from ITEMS.`],
    [/破城爆薬で(.+)を破壊しました。/g, (_match, name) => `${copyText('en', name)} destroyed with a Breach Charge.`],
    [/(.+)を現地回収しました。(.+)/g, (_match, name, loot) => `${copyText('en', name)} recovered on site. ${copyText('en', loot)}`],
    [/道路まで約(\d+)m/g, (_match, meters) => `about ${meters} m to road`]
  ])
});

const JAPANESE_TEXT_PATTERN = /[ぁ-んァ-ン一-龯]/u;
const LOCALIZED_TEXT_ATTRIBUTES = Object.freeze(['aria-label', 'title', 'placeholder', 'alt']);
const LOCALIZATION_SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT']);

function hasJapaneseText(value) {
  return JAPANESE_TEXT_PATTERN.test(String(value ?? ''));
}

function applyCopyPatterns(language, value) {
  const patterns = INLINE_COPY_PATTERNS[normalizeLanguage(language)] ?? [];
  return patterns.reduce((result, [pattern, replacer]) => result.replace(pattern, replacer), value);
}

function translateByTable(language, value) {
  const normalized = normalizeLanguage(language);
  const table = INLINE_COPY_CATALOG[normalized] ?? {};
  if (!Object.keys(table).length) return value;
  if (Object.prototype.hasOwnProperty.call(table, value)) return table[value];
  const trimmed = String(value).trim();
  if (trimmed !== value && Object.prototype.hasOwnProperty.call(table, trimmed)) {
    return String(value).replace(trimmed, table[trimmed]);
  }
  const translated = Object.entries(table)
    .sort((a, b) => b[0].length - a[0].length)
    .reduce((result, [source, target]) => result.split(source).join(target), value);
  return translated;
}

export function copyText(language, text = '') {
  const normalized = normalizeLanguage(language);
  const value = String(text ?? '');
  if (normalized === 'ja' || !value) return value;
  let result = applyCopyPatterns(normalized, value);
  result = translateByTable(normalized, result);
  return result;
}

export function bundleTextLocalized(language, bundle = {}) {
  const entries = Object.entries(bundle ?? {}).filter(([, value]) => Number(value) > 0);
  if (!entries.length) return copyText(language, 'なし');
  return entries.map(([key, value]) => `${copyText(language, TEXT_CATALOG.ja.dynamic?.resources?.[key] ?? key)} ${Math.floor(Number(value) || 0)}`).join(language === 'en' ? ', ' : '・');
}

function shouldLocalizeTextNode(node) {
  if (!node || !hasJapaneseText(node.nodeValue)) return false;
  for (let parent = node.parentElement; parent; parent = parent.parentElement) {
    if (LOCALIZATION_SKIP_TAGS.has(parent.tagName)) return false;
    if (parent.dataset?.i18nRaw === 'true') return false;
  }
  return true;
}

function localizeDynamicTree(language, root = globalThis.document, { textSources = null, attributeSources = null, inputValueSources = null } = {}) {
  const normalized = normalizeLanguage(language);
  if (!root) return;
  const documentRef = root.nodeType === 9 ? root : root.ownerDocument;
  const walkerRoot = root.nodeType === 9 ? root.body ?? root.documentElement : root;
  if (!documentRef?.createTreeWalker || !walkerRoot) return;
  const nodeFilter = globalThis.NodeFilter?.SHOW_TEXT ?? 4;
  const walker = documentRef.createTreeWalker(walkerRoot, nodeFilter);
  const textNodes = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (shouldLocalizeTextNode(node) || textSources?.has?.(node)) textNodes.push(node);
  }
  for (const node of textNodes) {
    const source = textSources?.get?.(node) ?? node.nodeValue;
    if (normalized === 'ja') {
      if (textSources?.has?.(node)) node.nodeValue = source;
    } else if (hasJapaneseText(source)) {
      textSources?.set?.(node, source);
      node.nodeValue = copyText(normalized, source);
    }
  }

  const elements = root.querySelectorAll?.('*') ?? [];
  for (const element of elements) {
    if (LOCALIZATION_SKIP_TAGS.has(element.tagName) || element.dataset?.i18nRaw === 'true') continue;
    for (const attr of LOCALIZED_TEXT_ATTRIBUTES) {
      const stored = attributeSources?.get?.(element);
      const source = stored?.get?.(attr) ?? element.getAttribute?.(attr);
      if (normalized === 'ja') {
        if (stored?.has?.(attr)) element.setAttribute(attr, source);
      } else if (hasJapaneseText(source)) {
        if (attributeSources) {
          const nextStored = stored ?? new Map();
          nextStored.set(attr, source);
          attributeSources.set(element, nextStored);
        }
        element.setAttribute(attr, copyText(normalized, source));
      }
    }
    if (element.tagName === 'INPUT' && element.type === 'button') {
      const source = inputValueSources?.get?.(element) ?? element.value;
      if (normalized === 'ja') {
        if (inputValueSources?.has?.(element)) element.value = source;
      } else if (hasJapaneseText(source)) {
        inputValueSources?.set?.(element, source);
        element.value = copyText(normalized, source);
      }
    }
  }
}

export function normalizeLanguage(language) {
  const code = String(language || '').toLowerCase().split('-')[0];
  return TEXT_CATALOG[code] ? code : 'ja';
}

export function readNested(source, path) {
  return String(path).split('.').reduce((value, key) => value?.[key], source);
}

export function translate(language, key, fallback = '') {
  const normalized = normalizeLanguage(language);
  const value = readNested(TEXT_CATALOG[normalized], key) ?? readNested(TEXT_CATALOG.ja, key);
  return typeof value === 'string' ? value : fallback;
}

export class I18nController {
  constructor({ storage = globalThis.localStorage, navigatorLanguage = globalThis.navigator?.language } = {}) {
    this.storage = storage;
    this.dynamicTextSources = new WeakMap();
    this.dynamicAttributeSources = new WeakMap();
    this.dynamicInputValueSources = new WeakMap();
    this.language = this.loadLanguage(navigatorLanguage);
  }

  loadLanguage(navigatorLanguage) {
    try {
      const stored = this.storage?.getItem?.(LANGUAGE_STORAGE_KEY);
      if (stored) return normalizeLanguage(stored);
    } catch {}
    return normalizeLanguage('ja');
  }

  setLanguage(language) {
    this.language = normalizeLanguage(language);
    try { this.storage?.setItem?.(LANGUAGE_STORAGE_KEY, this.language); } catch {}
    return this.language;
  }

  t(key, fallback = '') {
    return translate(this.language, key, fallback);
  }

  copy(text = '') {
    return copyText(this.language, text);
  }

  bundleText(bundle = {}) {
    return bundleTextLocalized(this.language, bundle);
  }

  apply(root = globalThis.document) {
    if (!root?.querySelectorAll) return;
    root.documentElement?.setAttribute?.('lang', this.language);
    for (const element of root.querySelectorAll('[data-i18n]')) {
      element.textContent = this.t(element.dataset.i18n, element.textContent ?? '');
    }
    for (const element of root.querySelectorAll('[data-i18n-aria-label]')) {
      element.setAttribute('aria-label', this.t(element.dataset.i18nAriaLabel, element.getAttribute('aria-label') ?? ''));
    }
    for (const element of root.querySelectorAll('[data-i18n-title]')) {
      element.setAttribute('title', this.t(element.dataset.i18nTitle, element.getAttribute('title') ?? ''));
    }
    localizeDynamicTree(this.language, root, {
      textSources: this.dynamicTextSources,
      attributeSources: this.dynamicAttributeSources,
      inputValueSources: this.dynamicInputValueSources
    });
  }

  localize(text = '') {
    return this.copy(text);
  }

  localizeElement(root = globalThis.document) {
    localizeDynamicTree(this.language, root, {
      textSources: this.dynamicTextSources,
      attributeSources: this.dynamicAttributeSources,
      inputValueSources: this.dynamicInputValueSources
    });
  }

  guideEntries() {
    return TEXT_CATALOG[this.language]?.guide ?? TEXT_CATALOG.ja.guide;
  }
}
