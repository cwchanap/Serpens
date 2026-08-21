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
		warehouseBuilding: '倉庫建築',
		cityInventorySummary: '{cityName} の都市在庫',
		currentCityInventory: '現在の都市在庫（直近の補充後）',
		cityInventoryMaterials: '都市在庫の資材',
		cityInventoryZeroCapacity: '都市在庫の容量は 0 です。',
		cityInventoryEmpty: '都市在庫は空です。',
		cityInventoryOverflow: '都市在庫の超過: {units} 単位。',
		capacity: '容量',
		used: '使用量',
		overflowUnits: 'あふれた数量',
		overflowCost: 'あふれコスト',
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
	logisticsRouteInspector: {
		ariaLabel: '物流航路インスペクター',
		close: '物流航路インスペクターを閉じる',
		eyebrow: '物流航路',
		summary: '航路概要',
		endpoints: '出発地・到着地',
		material: '資材',
		state: '状態',
		condition: '運用状態',
		schedule: 'スケジュール',
		frequency: '頻度',
		leadTime: '所要日数',
		nextDispatch: '次回輸送',
		capacity: '1回の輸送量',
		transportCostPerUnit: '単位輸送費',
		everyDays: '{days}日ごと',
		days: '{days}日',
		day: '{day}日目',
		latestAttempt: '最新の輸送試行',
		noLatestAttempt: '輸送試行の記録はまだありません。',
		destinationNeed: '到着先の需要',
		attemptCapacity: '試行時の容量',
		dispatchedQuantity: '輸送量',
		unusedCapacity: '未使用容量',
		unmetDestinationNeed: '未充足の到着先需要',
		attemptTransportCost: '試行時の輸送費',
		operationalTotals: '運用累計',
		utilization: '過去の稼働率',
		utilizationNote: '実効容量に対する割合です。',
		delivered: '納入済み',
		inTransit: '輸送中',
		transportCost: '輸送費',
		manageRoute: '航路を管理',
		effectiveCapacity: '実効輸送量（1回あたり）',
		daysChanged: '{from} 日 → {to} 日',
		currencyRange: '{from} → {to}',
		dispatchSuspension: 'イベントによる停止',
		dispatchSuspended: 'イベントにより停止中',
		modifierImpactsTitle: 'この輸送へのイベント影響'
	},
	worldMap: {
		ariaLabel: 'ワールドマップ',
		cities: '都市一覧',
		routes: '物流航路',
		routeSummary: '{origin} → {destination} · {material} · {state} · {condition}',
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
		kind: {
			event: 'カタログイベント',
			system: 'システム通知'
		},
		eventProvenance: '発生イベント: {eventTitle} · {eventId} · インスタンス {instanceId}'
	},
	activeModifiers: {
		title: '有効な修正効果',
		empty: '有効な修正効果はありません。',
		remainingDays: {
			one: '残り{days}日',
			other: '残り{days}日'
		}
	},
	policyPanel: {
		title: 'ポリシー',
		scopeLabel: 'ポリシーの範囲',
		targetLabel: 'ポリシーの対象',
		scopes: {
			company: '会社',
			city: '都市',
			store: '店舗'
		},
		selectedScope: '{scope}: {target}',
		parent: '親: {value}',
		provenance: {
			company: '会社ポリシー',
			city: '都市の上書き',
			store: '店舗の上書き',
			explicit: '明示的な上書き（{source}）',
			inherited: '{source}から継承'
		},
		inheritField: '{field}を継承',
		resetScope: '範囲をリセット'
	},
	reportsPanel: {
		title: 'レポート',
		modifierImpacts: {
			title: '直近日の修正効果',
			source: '発生元: {source}',
			affectedIds: '対象ID: {ids}',
			multiplier: '乗数: ×{multiplier}',
			resolvedMultiplier: '実効集計乗数: ×{multiplier}',
			baselineCost: '基準費用: {cost}',
			actualCost: '実際の丸め後費用: {cost}',
			applications: '適用回数: {count}'
		},
		modifierLifecycle: {
			title: '直近日の修正効果ライフサイクル',
			source: '発生元: {source}',
			status: {
				activated: '状態: 有効化',
				replaced: '状態: 置換',
				expired: '状態: 失効'
			},
			replacedBy: '置換後: {modifierId}'
		},
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
			imports: '外部輸入',
			inventoryLoss: '在庫損失費用',
			productionImports: '生産の外部輸入',
			warehouseOverflow: '都市在庫の超過',
			railShipments: '鉄路出荷',
			sevenDayNet: '7日純益',
			thirtyDayNet: '30日純益',
			sevenDayOperatingCashFlow: '7日営業キャッシュフロー',
			thirtyDayOperatingCashFlow: '30日営業キャッシュフロー'
		},
		productPressure: {
			title: '商品圧力の証拠',
			empty: '商品圧力の記録はありません。',
			freshness: '鮮度: {percent}%',
			waste: '廃棄: {units} 単位（{value}）',
			shrink: '在庫減耗: {units} 単位（{value}）',
			shrinkSingular: '在庫減耗: {units} 単位（{value}）',
			stockout: '在庫切れによる需要損失: {units} 単位',
			obsolescence: '陳腐化: 需要 {percent}',
			markdown: '値下げ: {amount}',
			basePrice: '基準価格: {price}',
			effectivePrice: '実効価格: {price}',
			inventoryLoss: '在庫損失費用: {amount}'
		},
		inventory: {
			productionCloseTitle: '生産終了時の在庫（小売補充前）',
			reportDay: 'レポート日 {day}',
			productionCloseUnavailable: '生産終了時の都市在庫は利用できません。',
			productionCloseEmpty: '生産終了時の都市在庫記録はありません。',
			currentTitle: '現在の都市在庫（直近の補充後）',
			currentUnavailable: '現在の都市在庫は利用できません。',
			currentEmpty: '現在の都市在庫記録はありません。',
			citySummary: '{cityName}: 都市在庫を {used} / {capacity} 使用中。',
			cityOverflow: '都市在庫の超過: {units} 単位（{cost}）。'
		},
		attribution: {
			title: '都市別の移動',
			empty: '都市別の移動はありません。',
			unknownCity: '不明な都市',
			production: '生産 — {cityName}: {units} 単位',
			productionUnavailable: '生産の帰属先は不明です: {units} 単位',
			consumption: '消費 — {cityName}: {units} 単位',
			consumptionUnavailable: '消費の帰属先は不明です: {units} 単位',
			localSupply: 'ローカル供給 — {sourceCityName} → {retailCityName}: {units} 単位',
			localSupplyUnavailable: 'ローカル供給の帰属先は不明です — {retailCityName}: {units} 単位',
			externalImports: '外部輸入 — {retailCityName}: {units} 単位',
			externalImportsUnavailable: '外部輸入の帰属先は不明です: {units} 単位'
		},
		logistics: {
			title: '直近日の物流',
			arrivalsTitle: '到着',
			attemptsTitle: '定期航路の輸送試行',
			noArrivals: 'この日の到着記録はありません。',
			noAttempts: 'この日の定期航路の輸送試行記録はありません。',
			deliveredUnits: '納入済み: {units} ユニット',
			scheduledTransportCost: '予定輸送費: {cost}',
			arrival:
				'{transferId} · {originCityName} → {destinationCityName} · {materialName} · {units} ユニット',
			attemptRoute: '{routeId} · {originCityName} → {destinationCityName} · {materialName}',
			destinationNeed: '到着先需要: {units}',
			attemptCapacity: '試行容量: {units}',
			dispatchedQuantity: '輸送量: {units}',
			unusedCapacity: '未使用容量: {units}',
			unmetDestinationNeed: '未充足の到着先需要: {units}',
			utilization: '稼働率: {value}',
			transportCost: '輸送費: {cost}',
			destinationFull: '到着先が満杯',
			recoveriesTitle: '修正効果の回復'
		},
		dailyWarnings: '日次警告',
		empty: 'まだレポートがありません。最初の日を進めると結果が生成されます。'
	},
	scorecard: {
		title: 'スコアカード'
	},
	managerDelegationPanel: {
		title: 'マネージャー委任',
		description: 'マネージャー役のスタッフに限定的なプレイブックを設定します。',
		empty: 'マネージャー役のスタッフはいません。',
		assignment: '物理配置: {store}',
		unassigned: '未割当',
		enabled: '有効',
		disabled: '無効',
		enabledFor: '{name}の委任を有効化',
		scope: '範囲',
		scopeFor: '{name}の委任範囲',
		target: '対象',
		targetFor: '{name}の委任対象',
		playbook: 'プレイブック',
		playbookFor: '{name}のプレイブック',
		scopes: {
			city: '都市',
			store: '店舗'
		},
		playbooks: {
			'protect-margin': '利益率を守る',
			'protect-availability': '供給可能性を守る',
			'grow-market-share': '市場シェアを伸ばす',
			'stabilize-cash': '資金を安定させる',
			'prefer-local-supply': '地域供給を優先'
		},
		authority: '権限',
		authorityFor: '{name}の{domain}権限',
		authorities: {
			pricing: '価格',
			inventory: '在庫',
			staffing: '人員配置',
			supply: '供給'
		},
		remove: '委任を削除',
		history: {
			title: '最近のアクション履歴',
			empty: 'マネージャーのアクション履歴はありません。',
			notApplied: '未適用',
			none: 'なし',
			outcomes: {
				applied: '適用済み',
				overridden: '上書き',
				rejected: '却下',
				'out-of-authority': '権限外'
			},
			reasons: {
				'margin-below-threshold': '利益率がしきい値未満',
				'availability-pressure': '供給不足の圧力',
				'staff-capacity-pressure': '人員上限の圧力',
				'market-position-low': '市場での位置が低い',
				'negative-operating-cash-flow': '営業キャッシュフローがマイナス',
				'better-local-supply': 'より良い地域供給',
				'conflict-lost': '競合に敗北',
				'authority-disabled': '権限が無効',
				'transition-rejected': '遷移が却下'
			},
			changes: {
				policy: '{field}: {before} → {proposed}（適用: {applied}）',
				inventory: '{product}: {before} → {proposed}（適用: {applied}）',
				supply: '供給: {before} → {proposed}（適用: {applied}）'
			}
		}
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
			imports: '外部輸入',
			staff: 'スタッフ',
			coverage: '充足'
		},
		productSources: '{storeName}の商品供給内訳',
		warnings: '{storeName}の警告',
		warehouseUnits: 'ローカル供給 {count}',
		importedUnits: '外部輸入 {count}',
		noWarnings: '現在の警告はありません。'
	},
	retailSupplySources: {
		title: '小売供給元',
		citySection: '{cityName}の供給元',
		controlLabel: '{cityName}のローカル供給元',
		controlDescription: '{cityName}がローカル供給を受け取る方法を選択します。',
		importsOnly: '輸入のみ',
		importsOnlySummary: '輸入のみです。補充はすべて外部輸入でまかなわれます。',
		inventorySummary: '都市在庫を {used} / {capacity} 使用中。',
		overflow: '超過: {units} 単位（{cost}）。',
		overflowSingular: '超過: {units} 単位（{cost}）。',
		noOverflow: '超過なし。'
	},
	storeStockTable: {
		title: '{storeName}の在庫',
		headings: {
			product: '商品',
			stock: '在庫',
			importCost: '輸入単価',
			configuredPrice: '設定価格',
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
		noReport: 'レポートなし',
		pressure: {
			neutral: '現在の圧力なし',
			freshness: '鮮度: {percent}%',
			waste: '廃棄: {units} 単位',
			shrink: '在庫減耗: {units} 単位',
			markdown: '値下げ: {amount}',
			obsolescence: '陳腐化: 需要 {percent}',
			stockout: '在庫切れ損失: {units} 単位',
			liveStockout: '現在在庫切れ',
			liveReorder: '現在補充が必要'
		},
		evidence: {
			freshness: '鮮度: {percent}%',
			waste: '廃棄: {units} 単位',
			shrink: '在庫減耗: {units} 単位',
			markdown: '値下げ: {amount}',
			obsolescence: '陳腐化: 需要 {percent}',
			stockout: '在庫切れによる需要損失: {units} 単位'
		}
	},
	storeDetail: {
		dismiss: '店舗詳細を閉じる',
		eyebrow: '店舗詳細',
		staffTitle: '{storeName}のスタッフ',
		close: '閉じる',
		closeLabel: '店舗詳細を閉じる',
		sections: '{storeName}のセクション',
		pressureSummary: {
			title: '商品圧力',
			neutral: '商品圧力は検出されませんでした。',
			waste: '{productName}: {units} 単位を廃棄。',
			shrink: '{productName}: {units} 単位の在庫減耗。',
			stockout: '{productName}: 在庫切れで {units} 単位の需要を損失。',
			markdown: '{productName}: 値下げにより {amount} の売上を損失。',
			obsolescence: '{productName}: 陳腐化により需要が {percent} に低下。',
			freshness: '{productName}: 鮮度は {percent}%。',
			inventoryLoss: '在庫損失費用: {amount}。'
		},
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
		cityInventoryFlow: '都市在庫フロー',
		scopeAria: '都市在庫の範囲',
		activeIndustryInventory: '都市在庫 — {cityName}',
		activeRetailSupply:
			'{retailCityName} のローカル供給 — {sourceCityName}: 都市在庫を {used} / {capacity} 使用中。',
		supplyState: {
			importsOnly: '{retailCityName} の供給: 輸入のみ — 補充は外部輸入で行われます。',
			zeroCapacity:
				'{retailCityName} のローカル供給 — 供給元 {sourceCityName} の都市在庫容量は 0 です。',
			emptyInventory: '{cityName} の都市在庫は空です。',
			inventoryOverflow: '{cityName} の都市在庫の超過: {units} 単位（{cost}）。'
		},
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
		category: 'カテゴリ',
		horizon: '予測期間',
		horizonDays: '{days}日',
		forecastHorizon: '{days}日間の根拠',
		evidenceLabel: '供給プランナーの根拠',
		evidenceKicker: 'プランナーの根拠',
		capacityLabel: '生産能力の根拠',
		capacityKicker: '能力',
		capacityTitle: '設置済み能力と利用可能能力',
		limitationsLabel: 'プランナーの制限',
		limitationsTitle: '既知の制限',
		recommendationLabel: '供給プランナーの推奨',
		recommendationKicker: '実行可能な計画',
		recommendationTitle: '次の推奨アクション',
		alternativesLabel: '供給プランナーの候補',
		alternativesTitle: 'その他の実行可能な候補',
		noOp: '操作なし',
		metrics: {
			demand: '実効需要',
			retailImportPrice: '小売輸入価格',
			perDay: '{value} / 日',
			perUnit: '{value} / 個',
			warehouse: '倉庫使用量 / 容量',
			logisticsWarehouse: '現在の物流で可視な倉庫在庫',
			buildings: '建物',
			installedCapacity: '設置済み能力',
			usableCapacity: '利用可能能力',
			forecastImports: '予測輸入量',
			startingInventory: '開始時在庫',
			endingInventory: '終了時在庫',
			daysOfCover: '在庫カバー日数',
			projectedStockout: '予測在庫切れ',
			notAvailable: '—'
		},
		cities: {
			label: 'プランナー都市コンテキスト',
			retail: '小売都市: {cityName}',
			supply: '供給都市: {cityName}'
		},
		demand: {
			sharedClaimants: '共有する需要都市:',
			contributor: '潜在 {potential}/日 · 補充上限 {ceiling}/日 · 実効 {effective}/日',
			clamp: '補充上限により目標需要は {ceiling}/日に制限されています。'
		},
		warehouse: {
			title: '倉庫の根拠',
			capacity: '{used} 使用 / {capacity}; 空き容量 {freeCapacity}。'
		},
		bottlenecks: {
			missingProducer: '{materialName} の生産者が不足しています。',
			warehouseCapacity: '倉庫容量のボトルネック: {overflow} 単位超過、空き容量 {freeCapacity}。',
			railDisconnected: '{materialName} を移動するには {buildingName} の鉄道接続が必要です。',
			productionCapacity: '{materialName} の生産能力ボトルネック: {deficit}/日不足。',
			inventoryCover: '{materialName} の在庫は約 {stockoutDay} 日目に枯渇します。',
			importReliance: '輸入依存: 30日間で {materialName} を {units} 単位。',
			none: '拘束となるボトルネックはありません。'
		},
		limitations: {
			remoteOriginProduction: 'ルート {routes} の遠隔出発地の生産はモデル化されていません。',
			railCapacity: '鉄道容量の競合はモデル化されていません。',
			storeSalesCapacity: '店舗販売能力はモデル化されていません。'
		},
		noOpReasons: {
			noDemand: '計画する需要がありません。',
			surplus: '供給はすでに余剰です。',
			unaffordable: '購入可能なアクションがありません。',
			ineffective: '計画を改善するアクションは予測されません。',
			noFeasibleAction: '実行可能なアクションがありません。',
			actionUnavailable: '必要なアクションが利用できないため、推奨はありません。'
		},
		economics: {
			structuralPrerequisite: '構造上の前提 — 残りの生産段階が完成するまでROIは利用できません',
			netEstimate: '30日間の純額見込み: {value}',
			beforeRail: '鉄道費用前: {value}',
			unavailable: 'このアクションのROI見込みは利用できません。',
			actionCost: 'アクション費用: {cost}。',
			railCostPending: '線路を配置したときに鉄道費用が計算されます。',
			railRequired: 'この生産者を利用するには鉄道接続が必要です。',
			importSavings: '30日間の輸入支出削減: {value}。',
			operatingCost: '30日間の運営費: {value}。',
			inputImportCost: '30日間の投入輸入費: {value}。',
			forecastOutcome:
				'予測結果（{horizon}日間）、ベースライン → アクション: 輸入 {baselineImports} → {actionImports}; カバー {baselineCover} → {actionCover}; 在庫切れ {baselineStockout} → {actionStockout}。',
			shortageReduction: '30日間の不足削減: {units} 単位; 在庫切れ改善: {stockoutDays} 日。',
			logisticsOutcome:
				'物流予測、ベースライン → アクション: 7日間の配送 {baselineDelivered7} → {actionDelivered7}; 30日間の配送 {baselineDelivered30} → {actionDelivered30}; 30日間の輸送費 {baselineTransportCost} → {actionTransportCost}。',
			afterRailProjection: '鉄道接続後のみ利用できる予測です。'
		},
		candidate: {
			available: '実行可能かつ購入可能',
			unaffordable: '現在の資金では購入できません',
			infeasible: '実行可能な配置がありません'
		},
		actions: {
			buildProducer: '{materialName} のために {buildingName}を建設',
			upgradeBuilding: '{buildingName}をレベル{level}へアップグレード',
			buildWarehouse: '{cityName} に倉庫を建設',
			connectRail: '{materialName} の鉄道を接続',
			createRoute: '{materialName} のルートを作成: {originName} → {destinationName}',
			editRoute: 'ルート {routeId} を編集: {fieldName} {from} → {to}',
			resumeRoute: 'ルート {routeId} を再開',
			changeSupplySource: '{retailCityName} の供給元を {supplyCityName} に変更',
			fields: {
				capacity: '容量',
				frequencyDays: '頻度',
				priority: '優先度'
			},
			noAction: '推奨アクションはありません'
		},
		logistics: {
			label: '物流予測の根拠',
			kicker: '物流',
			title: 'ルートと到着',
			currentWarehouse: '現在の物流で可視な倉庫在庫',
			warehouseValue: '{used} / {capacity}',
			inTransitTitle: '現在輸送中の在庫',
			inTransitRow:
				'{quantity} {materialName} を {cityName} へ輸送中。最短到着日は {day} 日目です。',
			noInTransit: 'この供給都市に向かう輸送中の在庫はありません。',
			routesTitle: 'ルート予測',
			noRoutes: 'この供給都市に影響するルート予測はありません。',
			routeTitle: '{originName} → {destinationName} · {materialName}',
			nextDispatch: '次の出荷: {day} 日目。',
			forecast:
				'7日間の配送: {delivered7}; 30日間の配送: {delivered30}; 30日間の輸送費: {transportCost}。',
			condition: '状態: {condition}。',
			conditions: {
				awaitingDispatch: '出荷待ち',
				normal: '正常',
				destinationFull: '配送先が満杯',
				originStockConstrained: '出発地在庫の制約',
				routeCapacityConstrained: 'ルート容量の制約',
				routeEventSuspended: 'イベントにより停止中',
				routePriorityConstrained: 'ルート優先度の制約',
				routeFrequency: 'ルート頻度の制約',
				routeLeadTime: 'ルート所要時間の制約',
				routePaused: 'ルートは一時停止中'
			},
			causes: {
				destinationFull: '{cityName} には {units} 単位分の物流で可視な倉庫容量がありません。',
				originStockConstrained: 'ルート {routeId} は出発地在庫が {units} 単位不足しています。',
				routeCapacityConstrained: 'ルート {routeId} は容量を {units} 単位超えています。',
				routePriorityConstrained:
					'ルート {routeId} はルート {blockingRouteId} の後順位で制約されています。',
				routeFrequency: 'ルート {routeId} は {nextArrivalDay} 日目より前に到着できません。',
				routeLeadTime: 'ルート {routeId} の初回到着は {firstArrivalDay} 日目です。',
				routePaused: 'ルート {routeId} は一時停止中です。',
				destinationConfiguration:
					'{retailCityName} は {supplyCityName} を供給元に設定しています。より良い供給元を選ぶか、到着ルートを追加してください。'
			}
		},
		states: {
			noSupportedProducts: '計画できる対応商品がありません。',
			retailCityUnavailable: '小売都市を利用できません。',
			supplyCityUnavailable: '供給都市を利用できません。',
			unsupportedCategory: 'カテゴリに対応していません。',
			missingProducerRecipe: 'このカテゴリに生産レシピがありません。',
			invalidRequest: 'プランナーのリクエストが無効です。'
		}
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
			logistics: '物流を切り替え',
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
	logisticsPanel: {
		title: '物流オペレーション',
		subtitle: '工業都市間で資材を移動し、定期航路を予定どおり運用します。',
		inventorySummary: '在庫 {used} / {capacity} を使用。',
		sections: {
			manualTransfer: '手動輸送',
			recurringRoutes: '定期航路',
			inTransit: '輸送中',
			recentTransfers: '最近の輸送',
			totals: '物流累計'
		},
		fields: {
			origin: '出発都市',
			destination: '到着都市',
			material: '資材',
			quantity: '数量',
			capacity: '1回の輸送量',
			frequencyDays: '頻度（日）',
			leadTimeDays: '所要日数',
			transportCostPerUnit: '単位輸送費',
			priority: '優先度'
		},
		actions: {
			dispatchTransfer: '輸送を開始',
			createRoute: '航路を作成',
			updateRoute: '航路の変更を保存',
			cancelEdit: '編集をキャンセル',
			editRoute: '航路を編集',
			pauseRoute: '航路を一時停止',
			resumeRoute: '航路を再開',
			reprioritizeRoute: '優先度を保存',
			removeRoute: '航路を削除'
		},
		ui: {
			quote: '所要日数: {leadTime} 日 · 輸送費: {cost}。',
			transferSubmitted: '輸送を開始しました。',
			routeCreated: '定期航路を作成しました。',
			routeUpdated: '定期航路を更新しました。',
			routePaused: '定期航路を一時停止しました。',
			routeResumed: '定期航路を再開しました。',
			routeReprioritized: '定期航路の優先度を更新しました。',
			routeRemoved: '定期航路を削除しました。',
			busy: '物流操作を実行中です。',
			unavailable: 'このモードでは物流操作を利用できません。',
			failed: '物流操作に失敗しました。',
			unchanged: '物流に変更はありません。',
			noRoutes: '定期航路はまだありません。',
			noInTransit: '現在輸送中の資材はありません。',
			noTransfers: '輸送履歴はまだありません。',
			noLatestAttempt: '輸送試行の記録はまだありません。',
			day: '{day}日目',
			arrives: '到着 {day}日目',
			stock: '在庫 {stock}',
			inTransit: '輸送中 {quantity}',
			utilization: '稼働率 {value}',
			latestAttempt: '最新の輸送試行',
			transferCost: '輸送費',
			delivered: '納入済み',
			transported: '輸送量'
		},
		conditions: {
			'awaiting-dispatch': '輸送待ち',
			'destination-full': '到着先が満杯',
			'origin-stock-constrained': '出発元在庫が制約',
			'route-capacity-constrained': '航路容量が制約',
			'route-event-suspended': 'イベントにより停止中',
			normal: '正常'
		},
		states: {
			active: '稼働中',
			paused: '停止中'
		},
		statuses: {
			'in-transit': '輸送中',
			delivered: '納入済み'
		},
		sources: {
			manual: '手動輸送',
			recurringRoute: '定期航路'
		},
		failures: {
			invalidOrigin: '有効な出発都市を選択してください。',
			invalidDestination: '有効な到着都市を選択してください。',
			sameCity: '出発都市と到着都市は別にしてください。',
			invalidMaterial: '有効な資材を選択してください。',
			invalidQuantity: '正の整数の数量を入力してください。',
			insufficientOriginStock: '出発元の在庫が不足しています。',
			insufficientCash: '輸送費を支払う現金が不足しています。',
			invalidCapacity: '正の整数の容量を入力してください。',
			invalidFrequencyDays: '正の整数の頻度を入力してください。',
			invalidLeadTimeDays: '正の整数の所要日数を入力してください。',
			invalidTransportCostPerUnit: '正の整数の単位輸送費を入力してください。',
			invalidPriority: '0以上の整数の優先度を入力してください。',
			routeNotFound: '定期航路が見つかりません。'
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
			unsupportedPurpose: '未対応の借入目的です',
			insufficientCredit: '利用可能な信用枠が不足しています',
			purchaseUnavailable: '購入できません',
			purchaseCostChanged: '購入価格が変更されました',
			cashSufficient: '現金で購入可能です — 現金コマンドを使用してください'
		},
		decisionAvailability: { available: '利用可能', unavailable: '資金調達を利用できません' },
		financedPurchase: {
			financeOpening: '開設費を融資する',
			review: '融資内容を確認',
			purchaseCost: '購入費用',
			shortfall: '不足資金',
			confirm: '融資を確定'
		},
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
			confirm: '{action}を確定',
			cancelReview: '確認を取り消す',
			dismissReview: '検討を閉じる',
			borrowingConfirmed: '借入を確定しました。',
			repaymentConfirmed: '返済を確定しました。',
			payoffConfirmed: '完済を確定しました。',
			refinancingConfirmed: '借換えを確定しました。',
			busy: '財務アクションを実行中です。',
			confirmationRequired: '確定前に確認が必要です。',
			unchanged: '財務の変更はありません。',
			failed: '財務アクションを完了できませんでした。',
			days: '{days}日',
			ninetyPlusDays: '90日以上',
			apr: 'APR',
			healthAdjustment: '健全性 +{amount}',
			historyAdjustment: '履歴 +{amount}',
			principal: '元本',
			interest: '利息',
			reviewAction: '{action}を確認',
			actionBorrowing: '借入',
			actionRepayment: '返済',
			actionPayoff: '完済',
			actionRefinancing: '借換え',
			reviewSubmission: '{amount} は確定後に実行されます。',
			refinanceReview: '{amount} を {term} で借換えます。現金受取は含まれません。',
			replacementComparison:
				'借換後APR {apr} · 初回支払 {firstPayment} · 最大支払 {peakPayment} · 現金受取は含まれません。'
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
			'soft-drinks': 'ソフトドリンク',
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
		events: {
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
					prepare: { label: '準備する', description: '候補地の調査と開店計画の段取りを始めます。' },
					pass: { label: '見送る', description: '資金を既存店の運営に集中させます。' }
				}
			},
			freightDisruption: {
				title: '輸送障害',
				context:
					'航路 {routeId}（{origin} → {destination}）の{material}の輸送が混乱しています。対応方法を選んでください。',
				options: {
					'accept-delay': {
						label: '遅延を受け入れる',
						description: '航路を維持しつつ、3日間、リードタイム+1日と輸送量25%減を受け入れます。'
					},
					'charter-carriers': {
						label: '臨時運送を手配',
						description:
							'今すぐ$2,000を支払い、2日間、輸送量を25%増やす代わりに輸送費が50%上がります。'
					},
					'suspend-shipments': {
						label: '輸送を停止',
						description: '2日間、この航路の配送をすべて停止します。'
					}
				},
				acceptDelay: {
					leadTime: 'この航路のリードタイムが3日間+1日になります。',
					capacity: 'この航路の輸送量が3日間×0.75になります。'
				},
				charterCarriers: {
					capacity: 'この航路の輸送量が2日間×1.25になります。',
					transportCost: 'この航路の輸送費が2日間×1.5になります。'
				},
				suspendShipments: {
					suspension: 'この航路の配送が2日間停止します。'
				}
			},
			rivalPromotion: {
				title: '競合の販促',
				context: '{competitorName} が {city} で大規模な販促を行っています。対応を選んでください。',
				options: {
					'counter-promote': {
						label: '対抗販促',
						description: '1,200 を使って販促に対抗し、市場ポジションを高めます。'
					},
					differentiate: {
						label: '差別化する',
						description: '販促を追わず、顧客満足度を高めます。'
					}
				},
				modifier: '{competitorName} の集客力が3日間18%上昇します。'
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
						description: '3日間、小売輸入費を10%割り引くために発注量を増やします。'
					}
				},
				bulkDiscount: { modifier: '全社の小売輸入費を3日間10%割り引きます。' }
			}
		},
		modifiers: {
			companyTarget: '全社の小売輸入',
			competitorTarget: '競合: {name}',
			removedCompetitorTarget: '競合: {competitorId}（撤退済み）',
			competitorAttraction: '集客力 ×{multiplier}',
			importCostDiscount: '小売輸入費 {percent}% 割引',
			durationDays: '{days}日間有効',
			startsOnDay: '{day}日目に開始',
			expiresAfterDay: '{day}日目終了後に失効',
			replaced: '以前の有効な修正効果を置き換えます。',
			expired: '修正効果が失効しました。',
			reportApplied: '{summary}を{count}件の輸入に適用しました。',
			reportExpired: '{summary}は{day}日目終了後に失効しました。',
			important: '重要',
			routeTarget: '航路: {origin} → {destination} · {material}',
			removedRouteTarget: '航路: {routeId}（削除済み）',
			routeLeadTime: '所要日数: {from} → {to} 日',
			routeCapacity: '輸送量: {from} → {to} 単位',
			routeSuspension: '輸送停止中',
			routeTransportCost: '単位輸送費: {from} → {to}',
			impactLeadTime: '所要日数: {from} 日 → {to} 日',
			impactCapacity: '輸送量: {from} → {to}、配送量: {fromDispatched} → {toDispatched}',
			impactSuspension: '輸送停止: {from} → {to} 単位',
			impactTransportCost: '輸送費: {from} → {to}',
			impactSource: '出典: {source}',
			recoveryLeadTime: '航路 {routeId} の所要日数が回復: {from} 日 → {to} 日',
			recoveryCapacity: '航路 {routeId} の輸送量が回復: {from} → {to}',
			recoverySuspension: '航路 {routeId} の輸送が再開しました。',
			recoveryTransportCost: '航路 {routeId} の単位輸送費が回復: {from} → {to}'
		},
		decisionFailures: {
			decisionNotFound: 'この判断は利用できなくなりました。',
			optionNotFound: 'この選択肢は利用できなくなりました。',
			decisionExpired: 'この判断の期限は切れています。',
			financeDelinquent: '債務の延滞中は借入できません。',
			financeDebtService: '現在の返済能力ではこの借入をカバーできません。',
			financeCapacity: '現在の与信枠ではこの借入をカバーできません。',
			effectRejected: 'この判断は適用できなくなりました。'
		},
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
			eventModifier: '有効な修正効果: {title}',
			factoryBlocked: '{buildingName} は原料不足です',
			logisticsOriginStock: '{origin} の {material} 在庫はこのルートの必要量を下回っています。',
			logisticsRouteCapacity:
				'{origin} から {destination} への {material} ルートは容量上限で、需要が残っています。',
			upcomingLoanPayment: '{purpose}の支払額 {amount} は{day}日目が期限です。',
			missedLoanPayment: '{purpose}に未払い {amount} があります。',
			covenantRisk: '債務返済カバレッジは {coverage} で、{threshold}を下回っています。',
			lowCashRunway: '資金余力はあと{days}日です。',
			managerException: '{managerName} の委任アクションを確認してください。'
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
				warehouseFlow: '都市在庫フロー',
				productChain: '{label}チェーン'
			},
			warehouseNode: '都市在庫',
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
				noWarehouseData: '都市在庫も日次レポートもまだありません。',
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
				producedImported: '1日 {actual} 生産 ・ 1サイクル {required} ・ 外部輸入',
				usedImported: '1日 {actual} 使用 ・ 1サイクル {required} ・ 外部輸入'
			},
			bottlenecks: {
				healthy: '{label} は現地で流れています。',
				watch: '{label} の在庫は直近の下流使用量を下回っています。',
				shortage: '{label} は外部輸入に依存したか、本日の現地不足がありました。',
				noLocalCapacity: '{label} を生産する現地施設がありません。',
				noReport: '{label} の最新フローデータはまだありません。',
				warehouseNoCapacity: '都市在庫の容量がありません。',
				warehouseOverflow: '{quantity} 単位が都市在庫から超過しています。',
				warehouseAvailable: '都市在庫の容量に余裕があります。'
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
