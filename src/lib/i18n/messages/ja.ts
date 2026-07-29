import type { Messages } from './en';

export const ja = {
	app: {
		title: 'Serpens'
	},
	topBar: {
		statusBar: 'ステータスバー',
		day: '{day}日目',
		cash: '現金',
		alerts: '通知',
		noAlerts: '通知なし',
		alertCount: {
			one: '通知 {count} 件',
			other: '通知 {count} 件'
		},
		alertsList: '通知一覧'
	},
	gameMenu: {
		menu: 'メニュー',
		mapView: '地図表示',
		language: '言語',
		saves: 'セーブ',
		views: {
			retail: '小売',
			industry: '工業',
			world: '世界'
		}
	},
	controlDesk: {
		group: '操作デスク',
		build: '建設',
		management: '管理',
		shortcuts: 'ショートカット',
		advanceDay: '次の日へ'
	},
	audioSettings: {
		group: '音声設定',
		title: '音声',
		bgm: 'BGM',
		music: '音楽',
		musicVolume: '音楽の音量',
		sfx: 'SFX',
		effects: '効果音',
		effectsVolume: '効果音の音量'
	},
	buildMenu: {
		dialog: '建設メニュー',
		close: '建設メニューを閉じる',
		unavailable: '利用不可',
		cityEyebrow: {
			retail: '小売都市',
			industry: '工業都市'
		},
		title: {
			retail: '小売を建設',
			industry: '工業を建設'
		},
		retail: {
			buildArchetype: '{name}を建設',
			setupRevenue: '初期費用 {setup} | 売上見込み {revenue}/日',
			rangeFormat: '{min}～{max}',
			validTiles: {
				one: '有効な立地 {count} 件',
				other: '有効な立地 {count} 件'
			},
			noOptions: '建設可能な小売店舗がありません'
		},
		industry: {
			filter: {
				allProducts: 'フィルター: すべての商品',
				selected: 'フィルター: {name}',
				clear: '商品フィルターを解除',
				dialog: '商品チェーンフィルター',
				title: '商品フィルター',
				close: '商品チェーンフィルターを閉じる',
				search: '商品を検索',
				allProductsLabel: 'すべての商品',
				allBuildings: 'すべての工業施設',
				chainBuildings: {
					one: 'チェーン施設 {count} 件',
					other: 'チェーン施設 {count} 件'
				},
				noChain: '対応する工業チェーンはまだありません',
				noMatches: '一致する商品がありません'
			},
			supplyAdvisor: '供給アドバイザー - 何を建てるべき？',
			buildType: '{name}を建設',
			starter: '初期向け',
			costOperating: '建設費 {cost} | 維持費 {operating}/日',
			recipe: 'レシピ',
			needsProducer: '{producer} が必要です',
			needsResource: '{resource} の資源タイルが必要です',
			noOptions: '建設可能な工業施設がありません'
		}
	},
	tileInspector: {
		ariaLabel: 'タイルインスペクター',
		close: 'タイルインスペクターを閉じる',
		selectTile: '都市タイルを選択',
		tileHeading: 'タイル {x}, {y}',
		storeVitals: '店舗指標',
		revenuePerDay: '日次売上',
		stockHealth: '在庫健全度',
		staffMorale: '従業員士気',
		level: 'レベル {level} / {max}',
		nextLabel: '次: {benefit}',
		nextBenefit: {
			unlockProductStaff: '商品 #{productNumber} を解放し、スタッフ上限が {staffCapacity} 増加',
			revenue: '売上 +10%'
		},
		upgrade: 'アップグレード - {cost}',
		maxLevel: '最大レベル',
		notEnoughCash: '現金が足りません。',
		openDetails: '詳細を開く ▸',
		tileStats: 'タイル情報',
		demand: '需要',
		rent: '地代',
		footTraffic: '人通り',
		customerFit: '顧客適合度'
	},
	industryTileInspector: {
		ariaLabel: '工業タイルインスペクター',
		close: '工業タイルインスペクターを閉じる',
		emptyTitle: '工業タイル',
		noTileSelected: 'タイル未選択',
		eyebrow: '工業タイル',
		heading: '工業タイル {x}, {y}',
		statsAria: '工業タイル情報',
		unknown: '不明',
		none: 'なし',
		terrain: '地形',
		resource: '資源',
		coordinates: '座標',
		access: '利用状況',
		locked: '未解放',
		open: '利用可能',
		detailsAria: '工業施設の詳細',
		statusLabel: '状態',
		producedTotal: '累計生産量',
		importedInputs: '輸入投入量',
		blockedDays: '停止日数',
		level: 'レベル {level} / {max}',
		output: '生産倍率 {multiplier}×',
		upgrade: 'アップグレード - {cost}',
		maxLevel: '最大レベル',
		notEnoughCash: '現金が足りません。',
		lastProduction: '直近の生産',
		noOutputYet: 'まだ生産実績がありません',
		buffer: 'バッファ',
		noBufferMaterials: 'バッファに資材はありません',
		warehouseSummary: '倉庫概要',
		warehouse: '倉庫',
		warehouseMaterials: '倉庫内資材',
		capacity: '容量',
		used: '使用量',
		overflowUnits: 'あふれた数量',
		overflowCost: 'あふれコスト',
		noMaterialsStored: '保管中の資材はありません',
		unknownBuildingType: '不明な工業施設タイプ',
		status: {
			idle: '待機中',
			produced: '生産済み',
			'imported-inputs': '投入を輸入',
			stalled: '停滞中（バッファ満杯）',
			blocked: '停止中'
		}
	},
	railBuild: {
		toolbar: '線路を建設',
		pickOrigin: '最初の施設を選択してください。',
		pickDestination: '経由地を選択し、その後に目的地の施設を選択してください。',
		confirm: '新規タイル {cells} 枚 · {cost}'
	},
	railSegmentInspector: {
		eyebrow: '線路',
		title: '線路区間',
		cells: 'マス数',
		level: 'レベル',
		capacity: '1日あたりの容量',
		utilization: '前日の稼働率',
		upgrade: 'アップグレード（{cost}）',
		demolish: '撤去（+{refund}）',
		pickSegment: '分岐点 — 区間を選択',
		atMaxLevel: '最大レベル',
		notEnoughCash: '現金が足りません。',
		cannotDemolish: '全マスが分岐点の共有セル — 撤去できません。'
	},
	worldMap: {
		ariaLabel: 'ワールドマップ',
		cities: '都市一覧',
		cityDetails: '都市詳細',
		closeCityDetails: '都市詳細を閉じる',
		cityEyebrow: {
			retail: '小売都市',
			industry: '工業都市'
		},
		selectionPending: '現在のチャレンジ操作が完了するまで都市を変更できません。',
		selectionUnavailable: 'このチャレンジでは都市を変更できません。',
		openForCash: '{cash} の資金で開放'
	},
	savePanel: {
		dismiss: 'セーブを閉じる',
		dialog: 'セーブ',
		eyebrow: 'セーブ',
		title: 'デスクトップセーブ',
		close: '閉じる',
		autoSection: '自動セーブ',
		autoSave: '自動セーブ',
		autoChip: 'AUTO',
		noAutoSave: 'まだ自動セーブがありません。',
		resume: '再開',
		createSection: 'セーブスロットを作成',
		newSlot: '新しいスロット',
		slotName: 'スロット名',
		saveSlot: '保存',
		manualSection: '手動セーブスロット',
		manualSlots: '手動スロット',
		load: '読込',
		overwrite: '上書き',
		delete: '削除',
		noManualSlots: '手動スロットはまだありません。',
		storeCount: {
			one: '{count} 店',
			other: '{count} 店'
		},
		autoSlotDetails: '{day}日目 · {storeCount} · {updatedAt}',
		manualSlotDetails: '{day}日目 · {city} · {storeCount} · {updatedAt}'
	},
	decisionQueue: {
		title: '意思決定キュー',
		empty: '本日の緊急判断はありません。',
		expiresDay: '{day}日目で期限切れ',
		creditUnavailableDelinquent: '延滞中の債務があるため、借入は利用できません。',
		creditUnavailableService: '現在の債務返済余力では、この借入を賄えません。',
		creditUnavailableCapacity: '現在の与信枠では、この借入を賄えません。'
	},
	policyPanel: {
		title: 'ポリシー'
	},
	reportsPanel: {
		title: 'レポート',
		metrics: {
			latestDailyResult: '直近日次結果',
			operatingIncome: '営業利益',
			operatingCashFlow: '営業キャッシュフロー',
			financingCashFlow: '財務キャッシュフロー',
			revenue: '売上',
			cashAfter: '終了時現金',
			principalBorrowed: '借入元本',
			principalRepaid: '返済元本',
			interestPaid: '支払利息',
			interestAccrued: '未払利息',
			interestCapitalized: '資本化利息',
			refinancedPrincipal: '借換元本',
			endingPrincipal: '期末元本',
			payroll: '給与',
			imports: '輸入',
			productionImports: '生産輸入',
			warehouseOverflow: '倉庫あふれ',
			railShipments: '鉄路出荷',
			sevenDayNet: '7日純益',
			thirtyDayNet: '30日純益',
			sevenDayOperatingCashFlow: '7日営業キャッシュフロー',
			thirtyDayOperatingCashFlow: '30日営業キャッシュフロー'
		},
		dailyWarnings: '日次警告',
		empty: 'まだレポートがありません。最初の日を進めると結果が生成されます。'
	},
	scorecard: {
		title: 'スコアカード'
	},
	staffPanel: {
		title: 'スタッフ',
		hiredCount: '雇用済みスタッフ {count} 名',
		candidates: '候補者',
		unassigned: '未割当',
		storeStaffing: '店舗の人員配置',
		assigned: '割当済み',
		coverage:
			'{storeName}: マネージャー {managerAssigned}/{managerRequired}、一般 {generalAssigned}/{generalRequired}',
		coverageShort:
			'マネージャー {managerAssigned}/{managerRequired}、一般 {generalAssigned}/{generalRequired}',
		role: {
			manager: 'マネージャー',
			general: '一般'
		},
		metrics: {
			level: 'レベル',
			skill: 'スキル',
			morale: '士気'
		},
		salaryPerMonth: '{salary}/月',
		hireButton: '{name}を雇用',
		assignButton: '割当',
		unassignButton: '割当解除',
		promoteButton: '{name}を昇進 ({cost})',
		emptyCandidates: '利用可能な候補者はいません',
		emptyUnassigned: '未割当スタッフはいません',
		emptyAssigned: '割当済みスタッフはいません',
		assignment: {
			unassigned: '未割当',
			currentlyUnassigned: '現在未割当',
			currentlyAssigned: '現在 {storeName} に割当済み'
		},
		actionLabels: {
			hire: '{name}、{role}候補者 {id} を雇用',
			assign: '{name}、{role}スタッフ {id} を割当、{context}',
			assignToStore: '{name}、{role}スタッフ {id} を {storeName} に割当',
			unassign: '{name}、{role}スタッフ {id} を {storeName} から解除',
			promote: '{name}、{role}スタッフ {id} をレベル {level} へ {cost} で昇進'
		},
		levelProgress: {
			max: '最大レベル',
			xp: 'XP {current}/{required}',
			inline: '{role} · レベル {level} · スキル {skill} · 士気 {morale}',
			storeInline: '{role} · スキル {skill} · 士気 {morale}'
		}
	},
	store: {
		defaultName: '店舗 #{ordinal}',
		location: '{neighborhood} ({x}, {y})'
	},
	storeOverview: {
		title: '店舗',
		dayOpen: '{day}日目',
		metrics: {
			revenue: '売上',
			grossMargin: '粗利',
			stock: '在庫',
			imports: '輸入',
			staff: 'スタッフ',
			coverage: '充足'
		},
		productSources: '{storeName}の商品供給内訳',
		warnings: '{storeName}の警告',
		warehouseUnits: '倉庫 {count}',
		importedUnits: '輸入 {count}',
		noWarnings: '現在の警告はありません。'
	},
	storeStockTable: {
		title: '{storeName}の在庫',
		headings: {
			product: '商品',
			stock: '在庫',
			importCost: '輸入単価',
			sellingPrice: '販売価格',
			reorder: '再発注',
			target: '目標',
			status: '状態',
			latest: '直近'
		},
		inputLabels: {
			sellingPrice: '{categoryName}の販売価格',
			reorderThreshold: '{categoryName}の再発注しきい値',
			targetStock: '{categoryName}の目標在庫'
		},
		latestReport: '販売 {sold} / 機会損失 {missed}',
		noReport: 'レポートなし'
	},
	storeDetail: {
		dismiss: '店舗詳細を閉じる',
		eyebrow: '店舗詳細',
		staffTitle: '{storeName}のスタッフ',
		close: '閉じる',
		closeLabel: '店舗詳細を閉じる',
		sections: '{storeName}のセクション',
		tabs: {
			stock: '在庫',
			chain: '商品チェーン',
			staff: 'スタッフ'
		}
	},
	storeProductChainPanel: {
		ariaLabel: '{storeName}の商品チェーン',
		categoryLabel: '商品カテゴリ',
		empty: 'この店舗カテゴリで利用できるローカル生産チェーンはまだありません。'
	},
	productChainsPanel: {
		ariaLabel: '商品チェーン',
		eyebrow: 'Folio II · 生産チェーン',
		modeGroup: '商品チェーン表示',
		storeCategoryChains: '店舗カテゴリチェーン',
		warehouseFlow: '倉庫フロー',
		emptyCategories: 'ローカル生産チェーンを持つ店舗カテゴリはまだありません。',
		emptyGraph: '利用できるチェーングラフがありません。'
	},
	supplyAdvisor: {
		dismiss: '供給アドバイザーを閉じる',
		dialog: '供給アドバイザー',
		eyebrow: '工業',
		title: '供給アドバイザー',
		close: '閉じる',
		closeLabel: '供給アドバイザーを閉じる',
		empty: '計画できるものはありません。需要を作るには小売店を建設してください。',
		chainLabel: '{categoryName}の供給チェーン',
		starter: '初期向け',
		supplied: '供給済み ✓',
		build: '{buildingName}を建設'
	},
	shortcutCheatSheet: {
		dismiss: 'キーボードショートカットを閉じる',
		dialog: 'キーボードショートカット',
		title: 'キーボードショートカット',
		close: 'ショートカットを閉じる',
		actions: {
			build: '建設メニューを切り替え',
			mapViews: '小売 / 工業 / 世界ビュー',
			dashboard: 'ダッシュボードを切り替え',
			policies: 'ポリシーを切り替え',
			staff: 'スタッフを切り替え',
			stores: '店舗を切り替え',
			decisions: '意思決定を切り替え',
			reports: 'レポートを切り替え',
			productChains: '商品チェーンを切り替え',
			finance: '財務を切り替え',
			advanceDay: '日を進める',
			escape: 'メニューを開く、または閉じる / キャンセル',
			cheatSheet: 'このチートシートを切り替え'
		}
	},
	productChainAtlas: {
		emptyNodes: 'このチェーンで利用できるグラフノードはありません。',
		warnings: '{title}の警告'
	},
	mapRenderer: {
		cityMapAriaLabel: '都市マップ',
		industryMapAriaLabel: '産業マップ',
		cityMapUnavailable: 'マップレンダラーを利用できません。',
		industryMapUnavailable: '産業マップレンダラーを利用できません。'
	},
	atlas: {
		categoryIndex: {
			ariaLabel: '商品カテゴリ索引',
			tier: 'Tier {tier}',
			metrics: '在庫 {stock} · 生産 {produced}/日 · 販売 {consumed}/日'
		},
		nodeBroadside: {
			inspected: '検査中のノード',
			emptyTitle: 'チェーンノード',
			empty: 'グラフノードを選択して最新のフロー指標を確認します。',
			sharedProducer: '共有生産者 - このチェーンの {count} 分岐に描画されています。',
			metrics: {
				buildings: '建物',
				capacity: '容量',
				capacityValue: '出力 {output} / 入力 {input}',
				produced: '生産',
				consumed: '消費',
				imported: '輸入',
				sold: '販売',
				missed: '機会損失',
				stock: '在庫'
			}
		},
		legend: {
			title: '· ルート ·',
			healthy: '健全な流れ',
			shortage: '不足'
		}
	},
	route: {
		cityPlanning: '都市計画',
		mapEyebrow: {
			retail: '小売都市マップ',
			industry: '工業都市マップ',
			world: '世界地図'
		},
		mapTitle: {
			world: '地域ネットワーク'
		},
		menu: {
			management: '管理',
			managementPanels: '管理パネル'
		},
		inspectors: {
			retailDetails: 'タイル詳細',
			industryDetails: '工業タイル詳細'
		},
		placement: {
			status: '配置状況',
			cancel: 'キャンセル'
		},
		controlTower: {
			eyebrow: '管理',
			close: '閉じる',
			dismiss: '{panel}を閉じる',
			closePanel: '{panel}を閉じる',
			panelStatus: '{panel}の状態'
		},
		save: {
			errorGeneric: 'セーブに失敗しました',
			errorCorrupt: 'セーブデータが破損しているか、互換性のないバージョンのデータです',
			errorStorageUnavailable: 'このブラウザではセーブ機能を利用できません',
			errorSlotNotFound: 'セーブスロットが見つかりません',
			autoSavedDay: '{day}日目を自動保存しました',
			noAutoSaveFound: '自動セーブが見つかりません',
			loadedAutoSave: '自動セーブを読み込みました',
			savedManualSlot: '{name} を保存しました',
			manualSlotNotFound: '手動セーブスロットが見つかりません',
			loadedManualSlot: '{name} を読み込みました',
			deletedManualSlot: 'セーブスロットを削除しました'
		}
	},
	financePanel: {
		title: '財務',
		metrics: {
			outstandingPrincipal: '未返済元本',
			amountDue: '支払総額',
			nextPayment: '次回支払',
			debtServiceCoverage: '債務返済カバレッジ',
			cashRunway: '資金余力',
			availableCredit: '84日間の利用可能枠',
			noDebtServiceDue: '予定されている債務返済はありません'
		},
		credit: {
			baseApr: '基本APR',
			adjustments: 'APR調整',
			reasons: {
				delinquentObligation: '延滞中の債務',
				principalCapacityLimited: '元本枠の上限',
				debtServiceCapacityLimited: '返済能力の上限'
			}
		},
		failures: {
			loanNotFound: '借入が見つかりません',
			loanClosed: '借入は完済済みです',
			loanDelinquent: '借入は延滞中です',
			invalidAmount: '整数ドル額を入力してください',
			belowMinimumBorrowing: '借入額が最低額を下回っています',
			insufficientCash: '現金が不足しています',
			overpayment: '金額が完済見積額を超えています',
			unsupportedTerm: '未対応の借入期間です',
			insufficientCredit: '利用可能な信用枠が不足しています',
			purchaseUnavailable: '購入できません',
			purchaseCostChanged: '購入価格が変更されました'
		},
		decisionAvailability: { available: '利用可能', unavailable: '資金調達を利用できません' },
		financedPurchase: { financeOpening: '開設費を融資する', review: '融資内容を確認' },
		transactions: {
			disbursement: '借入実行',
			principalPayment: '元本返済',
			interestPayment: '利息支払',
			missedPayment: '支払遅延',
			refinance: '借換え'
		},
		activity: {
			principalBorrowed: '借入元本',
			principalRepaid: '返済元本',
			interestPaid: '支払利息',
			financingCashFlow: '財務キャッシュフロー'
		},
		ui: {
			cash: '現金',
			creditOffer: '信用オファー',
			creditExplanation:
				'信用は営業キャッシュフロー、債務、健全性、返済履歴、元本余力、返済余力に基づきます。',
			loanTerm: '借入期間',
			finalApr: '最終APR',
			availableCredit: '利用可能枠',
			operatingCashFlow: '営業キャッシュフロー',
			principalHeadroom: '元本余力',
			serviceHeadroom: '返済余力',
			perWeek: '/週',
			borrowAmount: '借入額',
			firstPayment: '初回支払',
			regularPayment: '通常支払',
			peakPayment: '最大支払',
			reviewBorrowing: '借入を確認',
			loansAndHistory: '借入と履歴',
			originalPrincipal: '当初元本',
			remainingPrincipal: '残元本',
			term: '期間',
			arrears: '延滞',
			noPaymentScheduled: '支払予定なし',
			payoffQuote: '完済見積',
			repayAmount: '返済額',
			reviewRepayment: '返済を確認',
			reviewPayoff: '完済を確認',
			refinance: '借換え',
			transactionActivity: '取引履歴',
			noActivity: '財務取引はまだありません。',
			day: '{day}日目',
			review: '{action}を確認',
			confirm: '{action}を確定',
			cancelReview: '確認を取り消す',
			submittedAfterConfirmation: '{amount} は確定後に実行されます。',
			noCashOut: '現金受取は含まれません。',
			replacementApr: '借換後APR',
			borrowingConfirmed: '借入を確定しました。',
			repaymentConfirmed: '返済を確定しました。',
			payoffConfirmed: '完済を確定しました。',
			refinancingConfirmed: '借換えを確定しました。',
			busy: '財務アクションを実行中です。',
			confirmationRequired: '確定前に確認が必要です。',
			unchanged: '財務の変更はありません。',
			failed: '財務アクションを完了できませんでした。',
			days: '{days}日',
			ninetyPlusDays: '90日以上'
		}
	},
	game: {
		archetypes: {
			convenience: {
				name: 'コンビニエンスストア',
				description: '回転が速く、客足は安定しているが、利幅が薄く欠品に弱い業態です。',
				risks: {
					0: '欠品',
					1: '低利益率',
					2: '高い来店圧力'
				}
			},
			boutique: {
				name: 'ブティック雑貨店',
				description: '選び抜いた商品を扱い、顧客の好みや評判変動に敏感だが高単価を狙える業態です。',
				risks: {
					0: '流行とのずれ',
					1: '評判の揺れ',
					2: '上質な接客への期待'
				}
			},
			electronics: {
				name: '家電・ゲーム店',
				description: '単価が高く、発売需要や流行の波が大きい一方で在庫リスクも高い業態です。',
				risks: {
					0: '新作需要の変動',
					1: '盗難ロス',
					2: '高額在庫'
				}
			},
			grocery: {
				name: '食料品市場',
				description: '日常需要が安定する一方で、鮮度管理や幅広い品揃えが求められる業態です。',
				risks: {
					0: '鮮度低下',
					1: '廃棄ロス',
					2: '人員負荷'
				}
			}
		},
		products: {
			'bottled-water': 'ボトルウォーター',
			snacks: 'スナック',
			drinks: '飲料',
			essentials: '生活必需品',
			household: '日用品',
			apparel: '衣料品',
			'home-goods': '生活雑貨',
			gifts: 'ギフト',
			'fashion-accessories': 'ファッション小物',
			games: 'ゲーム',
			accessories: 'アクセサリー',
			devices: 'デバイス',
			peripherals: '周辺機器',
			produce: '青果',
			pantry: '常備食材',
			prepared: '調理済み食品',
			bakery: 'ベーカリー'
		},
		materials: {
			grain: '穀物',
			salt: '塩',
			oilseeds: '油糧種子',
			water: '水',
			fruit: '果物',
			sugar: '砂糖',
			pulpwood: '製紙用木材',
			'chemical-feedstock': '化学原料',
			flour: '小麦粉',
			'cooking-oil': '食用油',
			'filtered-water': 'ろ過水',
			syrup: 'シロップ',
			'paper-pulp': '紙パルプ',
			plastic: 'プラスチック',
			packaging: '包装資材',
			'cleaning-base': '洗浄基材',
			snacks: 'スナック',
			drinks: '飲料',
			essentials: '生活必需品',
			gifts: 'ギフト',
			'bottled-water': 'ボトルウォーター',
			produce: '青果',
			pantry: '常備食材'
		},
		industrialBuildings: {
			'grain-farm': '穀物農場',
			'salt-mine': '塩鉱山',
			'oilseed-farm': '油糧作物農場',
			'water-pump': '揚水施設',
			'fruit-farm': '果樹農園',
			'sugar-farm': '砂糖作物農場',
			'pulpwood-grove': '製紙林',
			'chemical-feedstock-well': '化学原料井',
			'flour-mill': '製粉所',
			'oil-press': '搾油所',
			'water-filtration-plant': '浄水施設',
			'syrup-plant': 'シロップ工場',
			'pulp-mill': 'パルプ工場',
			'plastic-plant': 'プラスチック工場',
			'packaging-plant': '包装工場',
			'chemical-plant': '化学工場',
			'snack-factory': 'スナック工場',
			'drink-bottling-plant': '飲料ボトリング工場',
			'household-goods-factory': '日用品工場',
			'gift-workshop': 'ギフト工房',
			'water-bottler': 'ボトルウォーター工場',
			'produce-packhouse': '青果包装所',
			'pantry-works': '常備食材工場',
			warehouse: '倉庫'
		},
		industryResources: {
			'grain-field': '穀物畑',
			'salt-deposit': '塩鉱床',
			'oilseed-field': '油糧作物畑',
			'water-source': '水源',
			'fruit-orchard': '果樹園',
			'sugar-field': '砂糖作物畑',
			'pulpwood-forest': '製紙林地',
			'chemical-feedstock': '化学原料地'
		},
		neighborhoods: {
			downtown: '中心街',
			campus: '大学街',
			residential: '住宅街',
			mall: 'モール地区',
			transit: '交通拠点',
			industrial: '工業地区',
			suburb: '郊外',
			parkEdge: '公園周辺'
		},
		terrain: {
			commercial: '商業地',
			residential: '住宅地',
			green: '緑地',
			transit: '交通地',
			industrial: '工業地'
		},
		tileFeatures: {
			road: '道路',
			river: '河川'
		},
		industryTerrain: {
			farmland: '農地',
			forest: '森林',
			water: '水辺',
			deposit: '鉱床',
			industrial: '工業用地',
			blocked: '建設不可'
		},
		policyFields: {
			pricing: '価格戦略',
			inventory: '在庫方針',
			staffing: '人員配置',
			marketing: 'マーケティング',
			service: '接客方針'
		},
		policyValues: {
			pricing: {
				discount: '割引重視',
				competitive: '競争価格',
				standard: '標準価格',
				premium: '高付加価値価格'
			},
			inventory: {
				lean: '在庫絞り込み',
				balanced: '均衡在庫',
				generous: '厚め在庫'
			},
			staffing: {
				minimal: '最少人数',
				efficient: '効率重視',
				service: '接客重視'
			},
			marketing: {
				none: '施策なし',
				awareness: '認知拡大',
				promotions: '販促重視',
				loyalty: '常連育成'
			},
			service: {
				speed: '迅速対応',
				balanced: '標準接客',
				highTouch: '手厚い接客'
			}
		},
		scoreKeys: {
			profit: '利益',
			customerSatisfaction: '顧客満足',
			staffMorale: '従業員士気',
			marketPosition: '市場ポジション'
		},
		worldCities: {
			'harbor-city': {
				name: 'ハーバーシティ',
				unlockRequirement: '開始時から使える小売都市',
				specialtySummary: '日用品需要が安定した、バランス型の開始都市です。'
			},
			'campus-junction': {
				name: 'キャンパスジャンクション',
				unlockRequirement: '店舗を2店開くか、7日目に到達する。',
				specialtySummary:
					'学生街の需要が強く、電子機器、ゲーム、アクセサリー、ギフトに向いています。'
			},
			'garden-borough': {
				name: 'ガーデンボロー',
				unlockRequirement: '4店舗に到達するか、日次報告後に資金を黒字で維持する。',
				specialtySummary: '住宅街の需要が強く、食料品や生活必需品、便利商材に向いています。'
			},
			'industry-city': {
				name: 'インダストリーシティ',
				unlockRequirement: '開始時から使える工業都市',
				specialtySummary: '資源の偏りが少なく、幅広い加工を始めやすい工業都市です。'
			},
			'breadbasket-basin': {
				name: 'ブレッドバスケット盆地',
				unlockRequirement: '倉庫と一次生産施設を1つ建設する。',
				specialtySummary: '穀物、油糧作物、果物、砂糖を軸にした食料チェーン向けの資源地帯です。'
			},
			'quarry-works': {
				name: 'クオリーワークス',
				unlockRequirement: '完成品素材を現地生産する。',
				specialtySummary: '塩、化学品、木材パルプ、包装材チェーンに強い採掘・工業地区です。'
			}
		},
		mapViews: {
			world: '世界',
			retail: '小売',
			industry: '工業'
		},
		managementPanels: {
			dashboard: 'ダッシュボード',
			policies: '方針',
			staff: 'スタッフ',
			stores: '店舗',
			decisions: '意思決定',
			reports: 'レポート',
			productChains: '製品チェーン',
			finance: '財務'
		},
		loanPurposes: {
			founding: '創業ローン',
			workingCapital: '運転資金',
			emergency: '緊急資金',
			supplierCredit: '仕入先信用',
			expansion: '拡張',
			refinance: '借換え'
		},
		loanStatuses: { active: '有効', delinquent: '延滞', paid: '完済', refinanced: '借換え済み' },
		loanTerms: { 28: '28日', 56: '56日', 84: '84日' }
	},
	copy: {
		stockStatus: {
			healthy: '健全',
			needsImport: '輸入が必要',
			outOfStock: '在庫切れ'
		},
		stockTrouble: {
			outOfStock: {
				one: '{count} 商品が在庫切れ',
				other: '{count} 商品が在庫切れ'
			},
			needsImport: {
				one: '{count} 商品が輸入待ち',
				other: '{count} 商品が輸入待ち'
			}
		},
		alerts: {
			storeStock: '{storeName}: {summary}',
			decision: '決定事項: {title}',
			factoryBlocked: '{buildingName} は原料不足です',
			upcomingLoanPayment: '{purpose}の支払額 {amount} は{day}日目が期限です。',
			missedLoanPayment: '{purpose}に未払い {amount} があります。',
			covenantRisk: '債務返済カバレッジは {coverage} で、1.25を下回っています。',
			lowCashRunway: '資金余力はあと{days}日です。'
		},
		reportWarnings: {
			stockPressure: '{storeName} に在庫圧力があります',
			nearStaffCapacity: '{storeName} はスタッフ定員に近づいています',
			shortManager: '{storeName} のマネージャーが {count} 名不足',
			shortGeneral: '{storeName} の一般スタッフが {count} 名不足',
			missedProductDemand: '{storeName} は商品需要を取り逃しました',
			reputationSlipping: '{storeName} の評判が下がっています',
			cashReservesLow: '現金準備が少なくなっています'
		},
		worldCity: {
			kind: {
				retail: '小売',
				industry: '工業'
			},
			state: {
				opened: '開設済み',
				revealed: '開設可能',
				locked: '未解放'
			},
			blockedOpeningCost: 'この都市を開くには {cash} の資金が必要です。',
			openedSummary: '{storeCount} 店舗・{buildingCount} 工業施設'
		},
		decisions: {
			cashPressure: {
				title: '資金繰り圧力',
				context: '現金がマイナスです。ブランドを守りながら営業を続ける方法を選びます。',
				options: {
					'short-loan': {
						label: '短期融資',
						description: '緊急の運転資金を入れ、利益への圧力を受け入れます。'
					},
					'cut-costs': {
						label: 'コスト削減',
						description: '裁量支出と在庫の厚みを削って現金を安定させます。'
					},
					'hold-course': {
						label: '現状維持',
						description: '反応的な変更を避け、翌日の売上回復に賭けます。'
					}
				}
			},
			expansionOpportunity: {
				title: '出店機会',
				context: '利益と現金余力が十分にあり、2号店の可能性が見えてきました。',
				options: {
					prepare: {
						label: '準備する',
						description: '候補地の調査と開店計画の段取りを始めます。'
					},
					pass: {
						label: '見送る',
						description: '資金を既存店の運営に集中させます。'
					}
				}
			},
			supplierTerms: {
				title: '仕入条件',
				context: '次の補充サイクル前に、仕入先が取引条件の見直しに応じる構えです。',
				options: {
					'negotiate-credit': {
						label: '与信交渉',
						description: '支払時期を延ばす代わりに、利益率の小さな悪化を受け入れます。'
					},
					'bulk-discount': {
						label: 'まとめ発注',
						description: '発注量を増やして、より良い仕入単価を狙います。'
					}
				}
			},
			expansionUnavailable: {
				title: '出店不可',
				context: 'このチェーンは当面、最大 {storeCap} 店まで運営できます。',
				options: {}
			},
			expansionCashBlocked: {
				title: '出店延期',
				context: '新しい店舗を開くには {cash} の資金が必要です。',
				options: {}
			},
			locationUnavailable: {
				title: '出店場所不可',
				blockedContext:
					'{reason} のため、その場所には出店できません。別の都市タイルを選んでください。',
				genericContext: '新店舗を開く前に、解放済みで未占有の都市タイルを選んでください。',
				reasons: {
					locked: '未解放区画',
					road: '道路区画',
					river: '河川区画'
				},
				acknowledge: {
					description: '立地計画に戻る。'
				},
				options: {}
			},
			industrialConstructionDelayed: {
				title: '工業建設を延期',
				contexts: {
					unknownTile: '不明な工業タイルです。',
					unknownBuildingType: '不明な工業建物タイプです。',
					lockedTile: 'その工業タイルは未解放です。',
					occupiedTile: 'その工業タイルはすでに使用中です。',
					requiresIndustrialTile: '工業用タイルが必要です。',
					requiresResource: '{resource} が必要です。',
					requiresCash: '{buildingName} の建設には {cash} の資金が必要です。'
				},
				acknowledge: {
					description: '工業計画に戻る。'
				},
				options: {}
			},
			railConstruction: {
				contexts: {
					unknownBuilding: '不明な鉄道建物です。',
					crossCity: '鉄道は異なる都市間をまたぐことはできません。',
					selfConnected: '線路は異なる2つの建物を結ぶ必要があります。',
					noValidPath: '目的地までの有効な線路経路がありません。',
					alreadyConnected: 'これらの建物はすでに鉄道で接続されています。',
					requiresCash: 'この線路の敷設には {cost} が必要ですが、所持金は {cash} です。',
					segmentAtMaxLevel: 'この線路区間はすでに最大レベルです。',
					unknownSegment: '不明な線路区間です。',
					tileHasRail: 'このタイルにはすでに線路が敷かれています。'
				}
			},
			worldCity: {
				cityUnavailable: {
					title: '都市を利用できません',
					context: '不明な都市です。'
				},
				notAvailableYet: {
					title: 'この都市はまだ利用できません',
					context: '開放条件: {requirement}'
				},
				openingDelayed: {
					title: '都市開放を延期',
					context: 'この都市を開くには {cash} の資金が必要です。'
				},
				acknowledge: {
					description: 'ワールドマップに戻る。'
				},
				options: {}
			},
			acknowledge: {
				label: '確認',
				description: '運営計画に戻る。'
			}
		},
		productChainGraph: {
			title: {
				warehouseFlow: '倉庫フロー',
				productChain: '{label}チェーン'
			},
			warehouseNode: '倉庫',
			nodeStats: {
				recipe: '{buildings} 棟 · 1日 {output}',
				stock: '在庫 {stock}'
			},
			health: {
				healthy: '健全',
				watch: '注意',
				shortage: '不足',
				'no-local-capacity': '現地生産なし',
				'no-report': '最新報告なし'
			},
			emptyReason: {
				noWarehouseData: '倉庫在庫も日次レポートもまだありません。',
				noLocalChain: 'このカテゴリにはまだ現地生産チェーンがありません。'
			},
			warnings: {
				noDailyReport: '日次レポートがまだないため、最新日のフローは表示できません。',
				noProductionRecipe: '{materialName} の生産レシピが見つかりません。'
			},
			edges: {
				in: '1日 {quantity} 入庫',
				out: '1日 {quantity} 出庫',
				produced: '1日 {actual} 生産 ・ 1サイクル {required}',
				used: '1日 {actual} 使用 ・ 1サイクル {required}',
				producedImported: '1日 {actual} 生産 ・ 1サイクル {required} ・ 輸入',
				usedImported: '1日 {actual} 使用 ・ 1サイクル {required} ・ 輸入'
			},
			bottlenecks: {
				healthy: '{label} は現地で流れています。',
				watch: '{label} の在庫は直近の下流使用量を下回っています。',
				shortage: '{label} は輸入依存か、本日の現地不足がありました。',
				noLocalCapacity: '{label} を生産する現地施設がありません。',
				noReport: '{label} の最新フローデータはまだありません。',
				warehouseNoCapacity: '倉庫容量がありません。',
				warehouseOverflow: '{quantity} ユニットが溢れています。',
				warehouseAvailable: '倉庫容量に余裕があります。'
			}
		}
	},
	scenarioDefinitions: {
		firstProfit: {
			title: '最初の利益',
			summary: '小さな店を収益事業へ育てます。',
			briefing: '期限までに黒字化してください。',
			strategyHint: 'コストを抑え、安定した顧客基盤を築きましょう。',
			objectives: {
				cumulativeNetIncome: '累積純利益を得る',
				positiveIncomeStreak: '黒字を連続して維持する'
			},
			failures: { negativeCash: '現金残高のマイナスを避ける' }
		},
		importSqueeze: {
			title: '輸入圧力',
			summary: '輸入品の値上がりの中で利益を守ります。',
			briefing: '輸入サイクルを完了し、利益率を守ってください。',
			strategyHint: '発注を慎重に計画し、過剰在庫を避けましょう。',
			objectives: {
				completedImportCycles: '輸入サイクルを完了する',
				cumulativeNetIncome: '累積純利益を得る'
			},
			failures: { negativeCash: '現金残高のマイナスを避ける' }
		},
		localLifeline: {
			title: '地域の生命線',
			summary: '強い地域サプライチェーンを築きます。',
			briefing: '地域生産品を店舗へ供給してください。',
			strategyHint: '生産能力と小売需要のバランスを取りましょう。',
			objectives: { localUnits: '地域生産品を供給する', localShare: '地域供給比率を達成する' },
			failures: { negativeCash: '現金残高のマイナスを避ける' }
		}
	},
	scenarioCatalog: {
		title: 'チャレンジカタログ',
		close: 'チャレンジカタログを閉じる',
		start: '開始',
		resume: '再開',
		resumeVersion: 'バージョン {version} を再開',
		restart: 'リスタート',
		startCurrent: '現行版を開始',
		confirmReplacement: '置き換えを確認',
		cancel: 'キャンセル',
		shareCode: '共有コード',
		importCode: 'コードを読み込む',
		copyCode: '{title} のコードをコピー',
		copySuccess: '共有コードをコピーしました。',
		copyFailure: '共有コードをコピーできません。',
		retry: '再試行',
		olderVersionConfirmation: '現行版を開始すると、進行中の旧版ランが置き換えられます。',
		importReplacementConfirmation: '進行中のランを置き換えますか？',
		startReplacementConfirmation: 'この挑戦を開始すると、進行中のランが置き換えられます。',
		best: 'ベスト',
		noBest: 'ランク対象の結果はまだありません',
		priorVersion: '旧版の結果',
		dayLimit: '{days}日制限',
		allowedContent: '都市{cities}、店舗タイプ{stores}、商品{products}',
		challengeDetails: 'チャレンジ詳細',
		restartChallenge: 'チャレンジをリスタート',
		catalog: 'チャレンジカタログ',
		returnSandbox: 'サンドボックスへ戻る',
		abandon: 'チャレンジを放棄',
		confirmAbandon: '放棄を確認'
	},
	scenarioStatus: {
		officialSeed: '公式シード {seed}',
		customSeed: 'カスタムシード {seed}',
		ranked: 'ランク対象',
		unranked: 'ランク対象外',
		activeVersion: '進行中 v{active}（現行 v{current}）',
		versionEligibility: 'バージョン {version} · {eligibility}',
		day: '{limit}日中 {day}日目',
		remaining: { one: '残り{count}日', other: '残り{count}日' },
		requiredProgress: '必須 {complete}/{total}',
		optionalProgress: '任意 {complete}/{total}',
		projectedScore: '予想スコア {score} ポイント',
		projectedMedal: '予想メダル {medal}',
		deadlineRisk: { one: '期限: 残り{count}日', other: '期限: 残り{count}日' },
		conditionRisk: '失敗リスク: 境界まで {distance} · {status}',
		progressAnnouncement: '{day}日目のチャレンジ進捗を更新しました。',
		showDetails: '目標の詳細を表示',
		hideDetails: '目標の詳細を非表示',
		dismiss: '閉じる'
	},
	scenarioObjectives: {
		heading: '目標',
		required: '必須',
		optional: '任意',
		requiredHeading: '必須目標',
		optionalHeading: '任意目標',
		failuresHeading: '失敗条件',
		actualTarget: '現在 {actual} · 目標 {target}',
		contributors: '貢献',
		noContributors: '該当記録なし',
		reportContributor: '{day}日目のレポート',
		status: {
			pending: '進行中',
			satisfied: '達成',
			missed: '未達',
			inactive: '非アクティブ',
			triggered: '発動'
		},
		windows: {
			current: '現在値',
			runToDate: '開始から現在まで',
			trailingReports: '直近{count}件のレポート',
			fixedReportDays: 'レポート日 {start}～{end}'
		}
	},
	scenarioResults: {
		title: 'チャレンジ結果',
		points: '{score} ポイント',
		bronze: 'ブロンズ',
		silver: 'シルバー',
		gold: 'ゴールド',
		noMedal: 'メダルなし',
		outcome: {
			completed: 'チャレンジ達成',
			failed: 'チャレンジ失敗',
			abandoned: 'チャレンジ放棄'
		},
		newBest: 'ベスト更新',
		bestUnchanged: 'ベストは更新されませんでした',
		nextMedal: '{medal}まであと{points}ポイント',
		deadlineNotTriggered: '期限未到達: {limit}日中 {day}日目',
		deadlineTriggered: '{day}日目に期限到達',
		announcement: '{outcome}、{score}ポイント。',
		close: '結果を閉じる'
	},
	scenarioDiagnostics: {
		invalidBuiltIn: '組み込みチャレンジが無効です: {detail}',
		malformedShareCode: '共有コードの形式が正しくありません。',
		unknownScenario: '不明なチャレンジです。',
		unsupportedVersion: '未対応のチャレンジバージョンです。',
		invalidSeed: 'チャレンジシードが無効です。',
		checksumMismatch: '共有コードのチェックサムが一致しません。',
		invalidDefinition: 'チャレンジ定義が無効です。',
		setupInvariantFailed: 'チャレンジを準備できませんでした。',
		staleDefinition: 'このチャレンジバージョンは利用できません。',
		persistenceReadFailed: 'チャレンジを読み込めませんでした。',
		persistenceWriteFailed: 'チャレンジを保存できませんでした。',
		missingRun: '進行中のチャレンジを利用できません。',
		forbiddenCommand: 'この操作はチャレンジで利用できません。',
		forbiddenContent: 'このコンテンツはチャレンジで利用できません。',
		invalidCommand: 'その操作は現在の状態では無効です。',
		terminalRun: 'このチャレンジは終了しています。'
	},
	scenarioModifiers: { importCostMultiplier: '輸入コスト ×{multiplier}' },
	placement: {
		chooseHighlightedTile: 'ハイライトされたタイルを選んで建設してください。',
		retail: {
			unknownCityTile: '不明な都市タイル',
			storeLimitReached: '出店上限に達しています',
			requiresCash: '{amount} の現金が必要です',
			occupiedLocation: '使用中の立地',
			lockedLocation: '未開放の立地',
			roadLocation: '道路の立地',
			riverLocation: '川の立地',
			noValidTiles: '有効な立地がありません'
		},
		industry: {
			lockedUntilRetail: '建設を解放するには小売店舗を開業してください。',
			unknownBuildingType: '不明な工業施設タイプ',
			requiresCash: '{buildingName} の建設には {amount} の現金が必要です。'
		}
	}
} as const satisfies Messages;
