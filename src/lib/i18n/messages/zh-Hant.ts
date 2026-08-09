import type { Messages } from './en';

export const zhHant = {
	app: {
		title: 'Serpens'
	},
	topBar: {
		statusBar: '狀態列',
		day: '第 {day} 天',
		cash: '現金',
		alerts: '警示',
		noAlerts: '沒有警示',
		alertCount: {
			one: '{count} 則警示',
			other: '{count} 則警示'
		},
		alertsList: '警示列表'
	},
	gameMenu: {
		menu: '選單',
		mapView: '地圖檢視',
		language: '語言',
		saves: '存檔',
		views: {
			retail: '零售',
			industry: '工業',
			world: '世界'
		}
	},
	controlDesk: {
		group: '控制台',
		build: '建設',
		management: '管理',
		shortcuts: '快捷鍵',
		advanceDay: '推進一天'
	},
	audioSettings: {
		group: '音效設定',
		title: '音效',
		bgm: 'BGM',
		music: '音樂',
		musicVolume: '音樂音量',
		sfx: 'SFX',
		effects: '音效',
		effectsVolume: '音效音量'
	},
	buildMenu: {
		dialog: '建設選單',
		close: '關閉建設選單',
		unavailable: '不可用',
		cityEyebrow: {
			retail: '零售城市',
			industry: '工業城市'
		},
		title: {
			retail: '建設零售',
			industry: '建設工業'
		},
		retail: {
			buildArchetype: '建設{name}',
			setupRevenue: '設置成本 {setup} | 預估營收 {revenue}/天',
			rangeFormat: '{min}–{max}',
			validTiles: {
				one: '{count} 個可用地塊',
				other: '{count} 個可用地塊'
			},
			noOptions: '沒有可建設的零售建築'
		},
		industry: {
			filter: {
				allProducts: '篩選：全部商品',
				selected: '篩選：{name}',
				clear: '清除商品篩選',
				dialog: '商品鏈篩選',
				title: '商品篩選',
				close: '關閉商品鏈篩選',
				search: '搜尋商品',
				allProductsLabel: '全部商品',
				allBuildings: '全部工業建築',
				chainBuildings: {
					one: '{count} 個鏈條建築',
					other: '{count} 個鏈條建築'
				},
				noChain: '尚無對應的工業鏈',
				noMatches: '找不到符合的商品'
			},
			supplyAdvisor: '供應顧問 - 我該蓋什麼？',
			buildType: '建設{name}',
			starter: '起步',
			costOperating: '成本 {cost} | 營運費 {operating}/天',
			recipe: '配方',
			needsProducer: '需要 {producer}',
			needsResource: '需要 {resource} 資源地塊',
			noOptions: '沒有可建設的工業建築'
		}
	},
	tileInspector: {
		ariaLabel: '地塊檢視器',
		close: '關閉地塊檢視器',
		selectTile: '選擇一個城市地塊',
		tileHeading: '地塊 {x}, {y}',
		storeVitals: '店鋪指標',
		revenuePerDay: '每日營收',
		stockHealth: '庫存健康度',
		staffMorale: '員工士氣',
		level: '等級 {level} / {max}',
		nextLabel: '下一步：{benefit}',
		nextBenefit: {
			unlockProductStaff: '解鎖商品 #{productNumber}，員工上限 +{staffCapacity}',
			revenue: '營收 +10%'
		},
		upgrade: '升級 - {cost}',
		maxLevel: '最高等級',
		notEnoughCash: '現金不足。',
		openDetails: '開啟詳細 ▸',
		tileStats: '地塊資訊',
		demand: '需求',
		rent: '租金',
		footTraffic: '人流',
		customerFit: '客群匹配'
	},
	industryTileInspector: {
		ariaLabel: '工業地塊檢視器',
		close: '關閉工業地塊檢視器',
		emptyTitle: '工業地塊',
		noTileSelected: '未選擇地塊',
		eyebrow: '工業地塊',
		heading: '工業地塊 {x}, {y}',
		statsAria: '工業地塊資訊',
		unknown: '未知',
		none: '無',
		terrain: '地形',
		resource: '資源',
		coordinates: '座標',
		access: '可用狀態',
		locked: '未解鎖',
		open: '可使用',
		detailsAria: '工業建築詳情',
		statusLabel: '狀態',
		producedTotal: '累計產量',
		importedInputs: '進口投入量',
		blockedDays: '停擺天數',
		level: '等級 {level} / {max}',
		output: '{multiplier}× 產出',
		upgrade: '升級 - {cost}',
		maxLevel: '最高等級',
		notEnoughCash: '現金不足。',
		lastProduction: '最近一次生產',
		noOutputYet: '尚未有產出',
		buffer: '緩衝庫存',
		noBufferMaterials: '緩衝庫存中沒有物料',
		warehouseBuilding: '倉庫建築',
		cityInventorySummary: '{cityName}城市庫存',
		currentCityInventory: '目前城市庫存（最近一次補貨後）',
		cityInventoryMaterials: '城市庫存物料',
		cityInventoryZeroCapacity: '城市庫存容量為 0。',
		cityInventoryEmpty: '城市庫存為空。',
		cityInventoryOverflow: '城市庫存溢出：{units} 單位。',
		capacity: '容量',
		used: '已使用',
		overflowUnits: '溢出單位',
		overflowCost: '溢出成本',
		unknownBuildingType: '未知的工業建築類型',
		status: {
			idle: '閒置',
			produced: '已生產',
			'imported-inputs': '已進口投入',
			stalled: '停滯（緩衝已滿）',
			blocked: '受阻'
		}
	},
	railBuild: {
		toolbar: '建設鐵路',
		pickOrigin: '請選擇起點建築。',
		pickDestination: '可選擇經由點，或直接選擇目的地建築。',
		confirm: '新增 {cells} 格 · {cost}'
	},
	railSegmentInspector: {
		eyebrow: '鐵路',
		title: '鐵路區段',
		cells: '格數',
		level: '等級',
		capacity: '每日容量',
		utilization: '昨日使用率',
		upgrade: '升級（{cost}）',
		demolish: '拆除（+{refund}）',
		pickSegment: '交會點 — 選擇區段',
		atMaxLevel: '最高等級',
		notEnoughCash: '現金不足。',
		cannotDemolish: '所有格均為共享交會點 — 無法拆除。'
	},
	logisticsRouteInspector: {
		ariaLabel: '物流航線檢視器',
		close: '關閉物流航線檢視器',
		eyebrow: '物流航線',
		summary: '航線摘要',
		endpoints: '起點與目的地',
		material: '材料',
		state: '狀態',
		condition: '運作狀況',
		schedule: '排程',
		frequency: '頻率',
		leadTime: '運輸天數',
		nextDispatch: '下次派出',
		capacity: '每次運輸容量',
		transportCostPerUnit: '每單位運輸費',
		everyDays: '每 {days} 天',
		days: '{days} 天',
		day: '第 {day} 天',
		latestAttempt: '最近運輸嘗試',
		noLatestAttempt: '尚無運輸嘗試記錄。',
		destinationNeed: '目的地需求',
		attemptCapacity: '嘗試容量',
		dispatchedQuantity: '派出數量',
		unusedCapacity: '未使用容量',
		unmetDestinationNeed: '未滿足的目的地需求',
		attemptTransportCost: '嘗試運輸費',
		operationalTotals: '營運累計',
		utilization: '歷史使用率',
		delivered: '已交付',
		inTransit: '運輸中',
		transportCost: '運輸費',
		manageRoute: '管理航線'
	},
	worldMap: {
		ariaLabel: '世界地圖',
		cities: '城市列表',
		routes: '物流航線',
		routeSummary: '{origin} → {destination} · {material} · {state} · {condition}',
		cityDetails: '城市詳情',
		closeCityDetails: '關閉城市詳情',
		cityEyebrow: {
			retail: '零售城市',
			industry: '工業城市'
		},
		selectionPending: '目前的挑戰操作完成前無法切換城市。',
		selectionUnavailable: '此挑戰無法切換城市。',
		openForCash: '花費 {cash} 開啟'
	},
	savePanel: {
		dismiss: '關閉存檔',
		dialog: '存檔',
		eyebrow: '存檔',
		title: '桌面存檔',
		close: '關閉',
		autoSection: '自動存檔',
		autoSave: '自動存檔',
		autoChip: 'AUTO',
		noAutoSave: '尚未有自動存檔。',
		resume: '繼續',
		createSection: '建立存檔槽',
		newSlot: '新存檔槽',
		slotName: '存檔槽名稱',
		saveSlot: '儲存',
		manualSection: '手動存檔槽',
		manualSlots: '手動存檔',
		load: '載入',
		overwrite: '覆寫',
		delete: '刪除',
		noManualSlots: '尚未有手動存檔槽。',
		storeCount: {
			one: '{count} 間店',
			other: '{count} 間店'
		},
		autoSlotDetails: '第 {day} 天 · {storeCount} · {updatedAt}',
		manualSlotDetails: '第 {day} 天 · {city} · {storeCount} · {updatedAt}'
	},
	decisionQueue: {
		title: '決策佇列',
		empty: '今天沒有緊急決策。',
		expiresDay: '第 {day} 天到期',
		kind: {
			event: '目錄事件',
			system: '系統通知'
		},
		eventProvenance: '來源事件: {eventTitle} · {eventId} · 實例 {instanceId}'
	},
	activeModifiers: {
		title: '生效中的修正效果',
		empty: '目前沒有生效中的修正效果。',
		remainingDays: {
			one: '剩餘 {days} 天',
			other: '剩餘 {days} 天'
		}
	},
	policyPanel: {
		title: '政策'
	},
	reportsPanel: {
		title: '報表',
		modifierImpacts: {
			title: '最近一天的修正效果影響',
			source: '來源: {source}',
			affectedIds: '受影響 ID: {ids}',
			multiplier: '乘數: ×{multiplier}',
			resolvedMultiplier: '有效彙總乘數: ×{multiplier}',
			baselineCost: '基準成本: {cost}',
			actualCost: '實際四捨五入成本: {cost}',
			applications: '套用次數: {count}'
		},
		modifierLifecycle: {
			title: '最近一天的修正效果生命週期',
			source: '來源: {source}',
			status: {
				activated: '狀態: 已啟用',
				replaced: '狀態: 已取代',
				expired: '狀態: 已到期'
			},
			replacedBy: '取代者: {modifierId}'
		},
		metrics: {
			latestDailyResult: '最新每日結果',
			operatingIncome: '營業利益',
			operatingCashFlow: '營業現金流',
			financingCashFlow: '融資現金流',
			revenue: '營收',
			cashAfter: '結束現金',
			principalBorrowed: '借入本金',
			principalRepaid: '償還本金',
			interestPaid: '已付利息',
			interestAccrued: '應計利息',
			interestCapitalized: '資本化利息',
			refinancedPrincipal: '再融資本金',
			endingPrincipal: '期末本金',
			payroll: '薪資',
			imports: '外部進口',
			productionImports: '生產外部進口',
			warehouseOverflow: '城市庫存溢出',
			railShipments: '鐵路出貨',
			sevenDayNet: '7 日淨利',
			thirtyDayNet: '30 日淨利',
			sevenDayOperatingCashFlow: '7 日營業現金流',
			thirtyDayOperatingCashFlow: '30 日營業現金流'
		},
		inventory: {
			productionCloseTitle: '生產結束時庫存（零售補貨前）',
			reportDay: '報表日 {day}',
			productionCloseUnavailable: '生產結束時的城市庫存無法使用。',
			productionCloseEmpty: '沒有生產結束時的城市庫存記錄。',
			currentTitle: '目前城市庫存（最近一次補貨後）',
			currentUnavailable: '目前城市庫存無法使用。',
			currentEmpty: '沒有目前城市庫存記錄。',
			citySummary: '{cityName}：已使用 {used} / {capacity} 城市庫存。',
			cityOverflow: '城市庫存溢出：{units} 單位（{cost}）。'
		},
		attribution: {
			title: '按城市歸屬的流動',
			empty: '沒有可用的按城市歸屬流動。',
			unknownCity: '未知城市',
			production: '生產 — {cityName}：{units} 單位',
			productionUnavailable: '生產歸屬無法使用：{units} 單位',
			consumption: '消耗 — {cityName}：{units} 單位',
			consumptionUnavailable: '消耗歸屬無法使用：{units} 單位',
			localSupply: '本地供應 — {sourceCityName} → {retailCityName}：{units} 單位',
			localSupplyUnavailable: '本地供應歸屬無法使用 — {retailCityName}：{units} 單位',
			externalImports: '外部進口 — {retailCityName}：{units} 單位',
			externalImportsUnavailable: '外部進口歸屬無法使用：{units} 單位'
		},
		logistics: {
			title: '最近一天的物流',
			arrivalsTitle: '到達',
			attemptsTitle: '定期航線運輸嘗試',
			noArrivals: '今天沒有到達記錄。',
			noAttempts: '今天沒有定期航線運輸嘗試記錄。',
			deliveredUnits: '已交付單位：{units}',
			scheduledTransportCost: '排定運輸費：{cost}',
			arrival:
				'{transferId} · {originCityName} → {destinationCityName} · {materialName} · {units} 單位',
			attemptRoute: '{routeId} · {originCityName} → {destinationCityName} · {materialName}',
			destinationNeed: '目的地需求：{units}',
			attemptCapacity: '嘗試容量：{units}',
			dispatchedQuantity: '派出數量：{units}',
			unusedCapacity: '未使用容量：{units}',
			unmetDestinationNeed: '未滿足目的地需求：{units}',
			utilization: '使用率：{value}',
			transportCost: '運輸費：{cost}',
			destinationFull: '目的地已滿'
		},
		dailyWarnings: '每日警告',
		empty: '尚未有報表。推進第一天後會產生結果。'
	},
	scorecard: {
		title: '評分卡'
	},
	staffPanel: {
		title: '員工',
		hiredCount: '已雇用 {count} 名員工',
		candidates: '候選人',
		unassigned: '未分派',
		storeStaffing: '店鋪人力配置',
		assigned: '已分派',
		coverage:
			'{storeName}：經理 {managerAssigned}/{managerRequired}，一般 {generalAssigned}/{generalRequired}',
		coverageShort:
			'經理 {managerAssigned}/{managerRequired}，一般 {generalAssigned}/{generalRequired}',
		role: {
			manager: '經理',
			general: '一般'
		},
		metrics: {
			level: '等級',
			skill: '技能',
			morale: '士氣'
		},
		salaryPerMonth: '{salary}/月',
		hireButton: '雇用 {name}',
		assignButton: '分派',
		unassignButton: '解除分派',
		promoteButton: '升級 {name}（{cost}）',
		emptyCandidates: '沒有可用候選人',
		emptyUnassigned: '沒有未分派員工',
		emptyAssigned: '沒有已分派員工',
		assignment: {
			unassigned: '未分派',
			currentlyUnassigned: '目前未分派',
			currentlyAssigned: '目前分派至 {storeName}'
		},
		actionLabels: {
			hire: '雇用 {name}，{role}候選人 {id}',
			assign: '分派 {name}，{role}員工 {id}，{context}',
			assignToStore: '分派 {name}，{role}員工 {id} 至 {storeName}',
			unassign: '將 {name}，{role}員工 {id} 從 {storeName} 解除分派',
			promote: '花費 {cost} 將 {name}，{role}員工 {id} 升至等級 {level}'
		},
		levelProgress: {
			max: '最高等級',
			xp: 'XP {current}/{required}',
			inline: '{role} · 等級 {level} · 技能 {skill} · 士氣 {morale}',
			storeInline: '{role} · 技能 {skill} · 士氣 {morale}'
		}
	},
	store: {
		defaultName: '店鋪 #{ordinal}',
		location: '{neighborhood} ({x}, {y})'
	},
	storeOverview: {
		title: '店鋪',
		dayOpen: '第 {day} 天',
		metrics: {
			revenue: '營收',
			grossMargin: '毛利',
			stock: '庫存',
			imports: '外部進口',
			staff: '員工',
			coverage: '覆蓋'
		},
		productSources: '{storeName}商品來源分布',
		warnings: '{storeName}警告',
		warehouseUnits: '本地供應 {count}',
		importedUnits: '外部進口 {count}',
		noWarnings: '目前沒有警告。'
	},
	retailSupplySources: {
		title: '零售供應來源',
		citySection: '{cityName}供應來源',
		controlLabel: '{cityName}的本地供應來源',
		controlDescription: '選擇{cityName}接收本地供應的方式。',
		importsOnly: '僅進口',
		importsOnlySummary: '僅進口。所有補貨皆由外部進口支應。',
		inventorySummary: '已使用 {used} / {capacity} 城市庫存。',
		overflow: '溢出：{units} 單位（{cost}）。',
		overflowSingular: '溢出：{units} 單位（{cost}）。',
		noOverflow: '沒有溢出。'
	},
	storeStockTable: {
		title: '{storeName}庫存',
		headings: {
			product: '商品',
			stock: '庫存',
			importCost: '進口成本',
			sellingPrice: '售價',
			reorder: '補貨點',
			target: '目標',
			status: '狀態',
			latest: '最新'
		},
		inputLabels: {
			sellingPrice: '{categoryName}售價',
			reorderThreshold: '{categoryName}補貨門檻',
			targetStock: '{categoryName}目標庫存'
		},
		latestReport: '售出 {sold} / 錯失 {missed}',
		noReport: '沒有報表'
	},
	storeDetail: {
		dismiss: '關閉店鋪詳情',
		eyebrow: '店鋪詳情',
		staffTitle: '{storeName}員工',
		close: '關閉',
		closeLabel: '關閉店鋪詳情',
		sections: '{storeName}區段',
		tabs: {
			stock: '庫存',
			chain: '商品鏈',
			staff: '員工'
		}
	},
	storeProductChainPanel: {
		ariaLabel: '{storeName}商品鏈',
		categoryLabel: '商品類別',
		empty: '此店鋪類別尚無可用的本地生產鏈。'
	},
	productChainsPanel: {
		ariaLabel: '商品鏈',
		eyebrow: 'Folio II · 生產鏈',
		modeGroup: '商品鏈檢視',
		storeCategoryChains: '店鋪類別鏈',
		cityInventoryFlow: '城市庫存流向',
		scopeAria: '城市庫存範圍',
		activeIndustryInventory: '城市庫存 — {cityName}',
		activeRetailSupply:
			'{retailCityName}的本地供應 — {sourceCityName}：已使用 {used} / {capacity} 城市庫存。',
		supplyState: {
			importsOnly: '{retailCityName}供應：僅進口 — 補貨使用外部進口。',
			zeroCapacity: '{retailCityName}的本地供應 — 供應來源 {sourceCityName} 的城市庫存容量為 0。',
			emptyInventory: '{cityName}的城市庫存為空。',
			inventoryOverflow: '{cityName}的城市庫存溢出：{units} 單位（{cost}）。'
		},
		emptyCategories: '尚無具備本地生產鏈的店鋪類別。',
		emptyGraph: '沒有可用的鏈條圖。'
	},
	supplyAdvisor: {
		dismiss: '關閉供應顧問',
		dialog: '供應顧問',
		eyebrow: '工業',
		title: '供應顧問',
		close: '關閉',
		closeLabel: '關閉供應顧問',
		empty: '沒有可規劃項目。建設零售店以創造需求。',
		chainLabel: '{categoryName}供應鏈',
		starter: '起步',
		supplied: '已供應 ✓',
		build: '建設{buildingName}'
	},
	shortcutCheatSheet: {
		dismiss: '關閉鍵盤快捷鍵',
		dialog: '鍵盤快捷鍵',
		title: '鍵盤快捷鍵',
		close: '關閉快捷鍵',
		actions: {
			build: '切換建設選單',
			mapViews: '零售 / 工業 / 世界檢視',
			dashboard: '切換儀表板',
			policies: '切換政策',
			staff: '切換員工',
			stores: '切換店鋪',
			decisions: '切換決策',
			reports: '切換報表',
			productChains: '切換商品鏈',
			finance: '切換財務',
			logistics: '切換物流',
			advanceDay: '推進一天',
			escape: '開啟選單，或關閉 / 取消',
			cheatSheet: '切換此快捷鍵表'
		}
	},
	productChainAtlas: {
		emptyNodes: '此鏈條沒有可用的圖節點。',
		warnings: '{title}警告'
	},
	mapRenderer: {
		cityMapAriaLabel: '城市地圖',
		industryMapAriaLabel: '工業地圖',
		cityMapUnavailable: '地圖渲染器無法使用。',
		industryMapUnavailable: '工業地圖渲染器無法使用。'
	},
	atlas: {
		categoryIndex: {
			ariaLabel: '商品類別索引',
			tier: 'Tier {tier}',
			metrics: '庫存 {stock} · 生產 {produced}/日 · 售出 {consumed}/日'
		},
		nodeBroadside: {
			inspected: '檢視節點',
			emptyTitle: '鏈條節點',
			empty: '選擇圖節點以檢視最新流量指標。',
			sharedProducer: '共享生產者 - 繪製在此鏈條的 {count} 個分支中。',
			metrics: {
				buildings: '建築',
				capacity: '產能',
				capacityValue: '輸出 {output} / 輸入 {input}',
				produced: '生產',
				consumed: '消耗',
				imported: '進口',
				sold: '售出',
				missed: '錯失',
				stock: '庫存'
			}
		},
		legend: {
			title: '· 路線 ·',
			healthy: '健康流向',
			shortage: '短缺'
		}
	},
	route: {
		cityPlanning: '城市規劃',
		mapEyebrow: {
			retail: '零售城市地圖',
			industry: '工業城市地圖',
			world: '世界地圖'
		},
		mapTitle: {
			world: '區域網絡'
		},
		menu: {
			management: '管理',
			managementPanels: '管理面板'
		},
		inspectors: {
			retailDetails: '地塊詳情',
			industryDetails: '工業地塊詳情'
		},
		placement: {
			status: '建造狀態',
			cancel: '取消'
		},
		controlTower: {
			eyebrow: '管理',
			close: '關閉',
			dismiss: '關閉{panel}',
			closePanel: '關閉{panel}',
			panelStatus: '{panel}狀態'
		},
		save: {
			errorGeneric: '存檔操作失敗',
			errorCorrupt: '存檔資料已損毀或來自不相容的版本',
			errorStorageUnavailable: '此瀏覽器無法使用存檔儲存空間',
			errorSlotNotFound: '找不到存檔槽',
			autoSavedDay: '已自動儲存第 {day} 天',
			noAutoSaveFound: '找不到自動存檔',
			loadedAutoSave: '已載入自動存檔',
			savedManualSlot: '已儲存 {name}',
			manualSlotNotFound: '找不到手動存檔槽',
			loadedManualSlot: '已載入 {name}',
			deletedManualSlot: '已刪除存檔槽'
		}
	},
	logisticsPanel: {
		title: '物流營運',
		subtitle: '在工業城市間運送材料，讓定期航線準時運作。',
		inventorySummary: '庫存使用 {used} / {capacity}。',
		sections: {
			manualTransfer: '手動運輸',
			recurringRoutes: '定期航線',
			inTransit: '運輸中',
			recentTransfers: '最近運輸',
			totals: '物流累計'
		},
		fields: {
			origin: '起點城市',
			destination: '目的地城市',
			material: '材料',
			quantity: '數量',
			capacity: '每次運輸容量',
			frequencyDays: '頻率（天）',
			leadTimeDays: '運輸天數',
			transportCostPerUnit: '每單位運輸費',
			priority: '優先順序'
		},
		actions: {
			dispatchTransfer: '派出運輸',
			createRoute: '建立航線',
			updateRoute: '儲存航線變更',
			cancelEdit: '取消編輯',
			editRoute: '編輯航線',
			pauseRoute: '暫停航線',
			resumeRoute: '恢復航線',
			reprioritizeRoute: '儲存優先順序',
			removeRoute: '移除航線'
		},
		ui: {
			quote: '運輸天數：{leadTime} 天 · 運輸費：{cost}。',
			transferSubmitted: '已派出運輸。',
			routeCreated: '已建立定期航線。',
			routeUpdated: '已更新定期航線。',
			routePaused: '已暫停定期航線。',
			routeResumed: '已恢復定期航線。',
			routeReprioritized: '已更新定期航線優先順序。',
			routeRemoved: '已移除定期航線。',
			busy: '物流操作正在進行中。',
			unavailable: '此模式無法使用物流操作。',
			failed: '物流操作失敗。',
			unchanged: '物流沒有變更。',
			noRoutes: '尚未建立定期航線。',
			noInTransit: '目前沒有運輸中的材料。',
			noTransfers: '尚未派出任何運輸。',
			noLatestAttempt: '尚無運輸嘗試記錄。',
			day: '第 {day} 天',
			arrives: '第 {day} 天抵達',
			stock: '庫存 {stock}',
			inTransit: '運輸中 {quantity}',
			utilization: '使用率 {value}',
			latestAttempt: '最近運輸嘗試',
			transferCost: '運輸費',
			delivered: '已交付',
			transported: '運輸量'
		},
		conditions: {
			'awaiting-dispatch': '等待派出',
			'destination-full': '目的地已滿',
			'origin-stock-constrained': '起點庫存受限',
			'route-capacity-constrained': '航線容量受限',
			normal: '正常'
		},
		states: {
			active: '運作中',
			paused: '已暫停'
		},
		statuses: {
			'in-transit': '運輸中',
			delivered: '已交付'
		},
		sources: {
			manual: '手動運輸',
			recurringRoute: '定期航線'
		},
		failures: {
			invalidOrigin: '請選擇有效的起點城市。',
			invalidDestination: '請選擇有效的目的地城市。',
			sameCity: '起點與目的地必須是不同城市。',
			invalidMaterial: '請選擇有效的材料。',
			invalidQuantity: '請輸入正整數數量。',
			insufficientOriginStock: '起點庫存不足。',
			insufficientCash: '現金不足以支付運輸費。',
			invalidCapacity: '請輸入正整數容量。',
			invalidFrequencyDays: '請輸入正整數頻率。',
			invalidLeadTimeDays: '請輸入正整數運輸天數。',
			invalidTransportCostPerUnit: '請輸入正整數每單位運輸費。',
			invalidPriority: '請輸入不小於零的整數優先順序。',
			routeNotFound: '找不到定期航線。'
		}
	},
	financePanel: {
		title: '財務',
		metrics: {
			outstandingPrincipal: '未償還本金',
			amountDue: '應付總額',
			nextPayment: '下次付款',
			debtServiceCoverage: '債務償付覆蓋率',
			cashRunway: '現金續航',
			availableCredit: '84 天可用信用額度',
			noDebtServiceDue: '沒有到期債務服務'
		},
		credit: {
			baseApr: '基本年利率',
			adjustments: '年利率調整',
			reasons: {
				delinquentObligation: '有逾期債務',
				principalCapacityLimited: '本金額度受限',
				debtServiceCapacityLimited: '償債能力受限'
			}
		},
		failures: {
			loanNotFound: '找不到貸款',
			loanClosed: '貸款已結清',
			loanDelinquent: '貸款已逾期',
			invalidAmount: '請輸入整數金額',
			belowMinimumBorrowing: '金額低於最低借款額',
			insufficientCash: '現金不足',
			overpayment: '金額超過清償報價',
			unsupportedTerm: '不支援的貸款期限',
			unsupportedPurpose: '不支援的貸款用途',
			insufficientCredit: '信用額度不足',
			purchaseUnavailable: '無法購買',
			purchaseCostChanged: '購買成本已變更',
			cashSufficient: '現金足以支付 — 請使用現金指令'
		},
		decisionAvailability: { available: '可用', unavailable: '無法取得融資' },
		financedPurchase: {
			financeOpening: '融資開設',
			review: '檢視融資',
			purchaseCost: '購買成本',
			shortfall: '現金缺口',
			confirm: '確認融資'
		},
		transactions: {
			disbursement: '貸款撥款',
			principalPayment: '本金付款',
			interestPayment: '利息付款',
			missedPayment: '逾期付款',
			refinance: '再融資'
		},
		activity: {
			principalBorrowed: '借入本金',
			principalRepaid: '償還本金',
			interestPaid: '已付利息',
			financingCashFlow: '融資現金流'
		},
		ui: {
			cash: '現金',
			creditOffer: '信用方案',
			creditExplanation: '信用額度依營業現金流、債務、健康度、還款紀錄、本金餘裕與償債餘裕決定。',
			loanTerm: '貸款期限',
			finalApr: '最終年利率',
			availableCredit: '可用信用額度',
			operatingCashFlow: '營業現金流',
			principalHeadroom: '本金餘裕',
			serviceHeadroom: '償債餘裕',
			perWeek: '/週',
			borrowAmount: '借款金額',
			firstPayment: '首次付款',
			regularPayment: '一般付款',
			peakPayment: '最高付款',
			reviewBorrowing: '檢視借款',
			loansAndHistory: '貸款與歷史',
			originalPrincipal: '原始本金',
			remainingPrincipal: '剩餘本金',
			term: '期限',
			arrears: '欠款',
			noPaymentScheduled: '沒有付款排程',
			payoffQuote: '清償報價',
			repayAmount: '還款金額',
			reviewRepayment: '檢視還款',
			reviewPayoff: '檢視清償',
			refinance: '再融資',
			transactionActivity: '交易活動',
			noActivity: '尚無財務活動。',
			day: '第 {day} 天',
			confirm: '確認{action}',
			cancelReview: '取消檢視',
			dismissReview: '關閉檢視',
			borrowingConfirmed: '借款已確認。',
			repaymentConfirmed: '還款已確認。',
			payoffConfirmed: '清償已確認。',
			refinancingConfirmed: '再融資已確認。',
			busy: '已有財務操作進行中。',
			confirmationRequired: '此操作在提交前需要確認。',
			unchanged: '沒有財務變更。',
			failed: '無法完成財務操作。',
			days: '{days} 天',
			ninetyPlusDays: '90 天以上',
			apr: '年利率',
			healthAdjustment: '健康度 +{amount}',
			historyAdjustment: '歷史 +{amount}',
			principal: '本金',
			interest: '利息',
			reviewAction: '檢視{action}',
			actionBorrowing: '借款',
			actionRepayment: '還款',
			actionPayoff: '清償',
			actionRefinancing: '再融資',
			reviewSubmission: '{amount} 僅會在確認後送出。',
			refinanceReview: '以 {term} 再融資 {amount}。不包含現金套現。',
			replacementComparison:
				'替換年利率 {apr} · 首次付款 {firstPayment} · 最高付款 {peakPayment} · 不包含現金套現。'
		}
	},
	game: {
		archetypes: {
			convenience: {
				name: '便利商店',
				description: '週轉快、人流穩定，但利潤較薄且容易受到缺貨影響。',
				risks: {
					0: '缺貨',
					1: '低利潤',
					2: '高人流壓力'
				}
			},
			boutique: {
				name: '精品雜貨店',
				description: '以精選商品為主，對顧客品味與口碑波動敏感，但有較高溢價空間。',
				risks: {
					0: '流行錯配',
					1: '口碑波動',
					2: '高品質服務期待'
				}
			},
			electronics: {
				name: '電子與遊戲店',
				description: '客單價高，容易受到新品上市與流行帶動，同時也承受較高庫存風險。',
				risks: {
					0: '新品波動',
					1: '損耗失竊',
					2: '高價庫存'
				}
			},
			grocery: {
				name: '雜貨市場',
				description: '日常需求穩定，但需要處理新鮮度、品項廣度與供應複雜度。',
				risks: {
					0: '新鮮度壓力',
					1: '耗損浪費',
					2: '人力壓力'
				}
			}
		},
		products: {
			'bottled-water': '瓶裝水',
			snacks: '零食',
			drinks: '飲料',
			essentials: '生活必需品',
			household: '家用用品',
			apparel: '服飾',
			'home-goods': '居家用品',
			gifts: '禮品',
			'fashion-accessories': '時尚配件',
			games: '遊戲',
			accessories: '配件',
			devices: '裝置',
			peripherals: '周邊設備',
			produce: '生鮮蔬果',
			pantry: '乾貨雜糧',
			prepared: '熟食',
			bakery: '烘焙'
		},
		materials: {
			grain: '穀物',
			salt: '鹽',
			oilseeds: '油料作物',
			water: '水',
			fruit: '水果',
			sugar: '糖',
			pulpwood: '紙漿木材',
			'chemical-feedstock': '化工原料',
			flour: '麵粉',
			'cooking-oil': '食用油',
			'filtered-water': '過濾水',
			syrup: '糖漿',
			'paper-pulp': '紙漿',
			plastic: '塑膠',
			packaging: '包裝材料',
			'cleaning-base': '清潔基底',
			snacks: '零食',
			drinks: '飲料',
			essentials: '生活必需品',
			gifts: '禮品',
			'bottled-water': '瓶裝水',
			produce: '生鮮蔬果',
			pantry: '乾貨雜糧'
		},
		industrialBuildings: {
			'grain-farm': '穀物農場',
			'salt-mine': '鹽礦',
			'oilseed-farm': '油料作物農場',
			'water-pump': '抽水站',
			'fruit-farm': '果園農場',
			'sugar-farm': '糖料作物農場',
			'pulpwood-grove': '紙漿林場',
			'chemical-feedstock-well': '化工原料井',
			'flour-mill': '麵粉廠',
			'oil-press': '榨油廠',
			'water-filtration-plant': '淨水廠',
			'syrup-plant': '糖漿廠',
			'pulp-mill': '紙漿廠',
			'plastic-plant': '塑膠廠',
			'packaging-plant': '包裝廠',
			'chemical-plant': '化工廠',
			'snack-factory': '零食工廠',
			'drink-bottling-plant': '飲料裝瓶廠',
			'household-goods-factory': '家用品工廠',
			'gift-workshop': '禮品工坊',
			'water-bottler': '瓶裝水工廠',
			'produce-packhouse': '蔬果包裝場',
			'pantry-works': '乾貨加工廠',
			warehouse: '倉庫'
		},
		industryResources: {
			'grain-field': '穀物田',
			'salt-deposit': '鹽礦層',
			'oilseed-field': '油料作物田',
			'water-source': '水源地',
			'fruit-orchard': '果園',
			'sugar-field': '糖料作物田',
			'pulpwood-forest': '紙漿林',
			'chemical-feedstock': '化工原料地'
		},
		neighborhoods: {
			downtown: '市中心',
			campus: '校園區',
			residential: '住宅區',
			mall: '商場區',
			transit: '交通樞紐',
			industrial: '工業區',
			suburb: '郊區',
			parkEdge: '公園邊緣'
		},
		terrain: {
			commercial: '商業地',
			residential: '住宅地',
			green: '綠地',
			transit: '交通地',
			industrial: '工業地'
		},
		tileFeatures: {
			road: '道路',
			river: '河流'
		},
		industryTerrain: {
			farmland: '農地',
			forest: '森林',
			water: '水域',
			deposit: '礦藏地',
			industrial: '工業用地',
			blocked: '不可建設'
		},
		policyFields: {
			pricing: '定價策略',
			inventory: '庫存方針',
			staffing: '人力配置',
			marketing: '行銷方向',
			service: '服務方針'
		},
		policyValues: {
			pricing: {
				discount: '折扣導向',
				competitive: '競爭定價',
				standard: '標準定價',
				premium: '高端定價'
			},
			inventory: {
				lean: '精簡庫存',
				balanced: '均衡庫存',
				generous: '寬鬆庫存'
			},
			staffing: {
				minimal: '最低人力',
				efficient: '效率優先',
				service: '服務優先'
			},
			marketing: {
				none: '不投放',
				awareness: '提升認知',
				promotions: '促銷導向',
				loyalty: '培養忠誠'
			},
			service: {
				speed: '快速服務',
				balanced: '均衡服務',
				highTouch: '高接觸服務'
			}
		},
		scoreKeys: {
			profit: '利潤',
			customerSatisfaction: '顧客滿意度',
			staffMorale: '員工士氣',
			marketPosition: '市場地位'
		},
		worldCities: {
			'harbor-city': {
				name: '港灣城',
				unlockRequirement: '起始零售城市',
				specialtySummary: '均衡的起始市場，日常需求穩定。'
			},
			'campus-junction': {
				name: '校園匯點',
				unlockRequirement: '擁有 2 間店或到達第 7 天。',
				specialtySummary: '學生族群密集，偏好電子產品、遊戲、配件與禮品。'
			},
			'garden-borough': {
				name: '花園自治區',
				unlockRequirement: '達到 4 間店，或在每日報表後維持正現金。',
				specialtySummary: '住宅需求強，特別適合雜貨、生活用品與便利型商品。'
			},
			'industry-city': {
				name: '工業城',
				unlockRequirement: '起始工業城市',
				specialtySummary: '起始資源分布均衡，適合展開多種加工鏈。'
			},
			'breadbasket-basin': {
				name: '糧籃盆地',
				unlockRequirement: '建造一座倉庫與一座原料生產設施。',
				specialtySummary: '以穀物、油料、水果與糖類為核心的食品供應資源盆地。'
			},
			'quarry-works': {
				name: '採石工坊區',
				unlockRequirement: '在本地生產一種成品材料。',
				specialtySummary: '擅長鹽、化工、紙漿與包裝鏈的採掘加工工業區。'
			}
		},
		mapViews: {
			world: '世界',
			retail: '零售',
			industry: '工業'
		},
		managementPanels: {
			dashboard: '儀表板',
			policies: '政策',
			staff: '員工',
			stores: '商店',
			decisions: '決策',
			reports: '報表',
			productChains: '產品鏈',
			finance: '財務'
		},
		loanPurposes: {
			founding: '創業貸款',
			workingCapital: '營運資金',
			emergency: '緊急資金',
			supplierCredit: '供應商信用',
			expansion: '擴張',
			refinance: '再融資'
		},
		loanStatuses: { active: '有效', delinquent: '逾期', paid: '已結清', refinanced: '已再融資' },
		loanTerms: { 28: '28 天', 56: '56 天', 84: '84 天' }
	},
	copy: {
		events: {
			cashPressure: {
				title: '現金壓力',
				context: '現金低於零。請選擇如何維持營運，同時保護品牌。',
				options: {
					'short-loan': { label: '短期貸款', description: '取得緊急營運資金，並承受獲利壓力。' },
					'cut-costs': { label: '削減成本', description: '縮減裁量支出與庫存深度，先穩定現金。' },
					'hold-course': { label: '維持原計畫', description: '避免過度反應，等待明天的銷售回升。' }
				}
			},
			expansionOpportunity: {
				title: '擴店機會',
				context: '目前利潤與現金水位穩健，開設第二間店已經具備可能性。',
				options: {
					prepare: { label: '開始準備', description: '著手勘查地點並安排展店計畫。' },
					pass: { label: '先跳過', description: '把資金集中在目前店面的營運上。' }
				}
			},
			supplierTerms: {
				title: '供應條件',
				context: '供應商願意在下一次補貨前重新協商訂購條件。',
				options: {
					'negotiate-credit': {
						label: '談授信',
						description: '延後付款時點，但要接受些微毛利壓力。'
					},
					'bulk-discount': {
						label: '大量折扣',
						description: '承諾更大的訂單量，換取三天的零售進口成本九折優惠。'
					}
				},
				bulkDiscount: { modifier: '全公司的零售進口成本享三天九折優惠。' }
			}
		},
		modifiers: {
			companyTarget: '全公司的零售進口',
			importCostDiscount: '零售進口成本 {percent}% 折扣',
			durationDays: '持續 {days} 天',
			startsOnDay: '第 {day} 天開始',
			expiresAfterDay: '第 {day} 天結束後到期',
			replaced: '取代先前生效的修正效果。',
			expired: '修正效果已到期。',
			reportApplied: '{summary}已套用至 {count} 筆進口。',
			reportExpired: '{summary}於第 {day} 天結束後到期。',
			important: '重要'
		},
		decisionFailures: {
			decisionNotFound: '這項決策已無法使用。',
			optionNotFound: '這個選項已無法使用。',
			decisionExpired: '這項決策已過期。',
			financeDelinquent: '有逾期債務時無法借款。',
			financeDebtService: '目前的償債能力不足以支付這筆貸款。',
			financeCapacity: '目前的信用額度不足以支付這筆貸款。',
			effectRejected: '這項決策已無法套用。'
		},
		stockStatus: {
			healthy: '健康',
			needsImport: '需要進口',
			outOfStock: '缺貨'
		},
		stockTrouble: {
			outOfStock: {
				one: '{count} 項商品缺貨',
				other: '{count} 項商品缺貨'
			},
			needsImport: {
				one: '{count} 項商品需要進口',
				other: '{count} 項商品需要進口'
			}
		},
		alerts: {
			storeStock: '{storeName}: {summary}',
			decision: '決策: {title}',
			eventModifier: '生效中的修正效果: {title}',
			factoryBlocked: '{buildingName} 缺少投入原料',
			upcomingLoanPayment: '{purpose}的 {amount} 付款將於第 {day} 天到期。',
			missedLoanPayment: '{purpose}有 {amount} 的逾期付款。',
			covenantRisk: '債務償付覆蓋率為 {coverage}，低於 {threshold}。',
			lowCashRunway: '現金續航只剩 {days} 天。'
		},
		reportWarnings: {
			stockPressure: '{storeName} 有庫存壓力',
			nearStaffCapacity: '{storeName} 接近員工容量上限',
			shortManager: '{storeName} 缺少 {count} 名經理',
			shortGeneral: '{storeName} 缺少 {count} 名一般員工',
			missedProductDemand: '{storeName} 錯失商品需求',
			reputationSlipping: '{storeName} 聲譽正在下滑',
			cashReservesLow: '現金儲備偏低'
		},
		worldCity: {
			kind: {
				retail: '零售',
				industry: '工業'
			},
			state: {
				opened: '已開放',
				revealed: '可開啟',
				locked: '未解鎖'
			},
			blockedOpeningCost: '開啟這座城市需要 {cash} 現金。',
			openedSummary: '{storeCount} 間商店 - {buildingCount} 座工業建築'
		},
		decisions: {
			cashPressure: {
				title: '現金壓力',
				context: '現金低於零。請選擇如何維持營運，同時保護品牌。',
				options: {
					'short-loan': {
						label: '短期貸款',
						description: '取得緊急營運資金，並承受獲利壓力。'
					},
					'cut-costs': {
						label: '削減成本',
						description: '縮減裁量支出與庫存深度，先穩定現金。'
					},
					'hold-course': {
						label: '維持原計畫',
						description: '避免過度反應，等待明天的銷售回升。'
					}
				}
			},
			expansionOpportunity: {
				title: '擴店機會',
				context: '目前利潤與現金水位穩健，開設第二間店已經具備可能性。',
				options: {
					prepare: {
						label: '開始準備',
						description: '著手勘查地點並安排展店計畫。'
					},
					pass: {
						label: '先跳過',
						description: '把資金集中在目前店面的營運上。'
					}
				}
			},
			supplierTerms: {
				title: '供應條件',
				context: '供應商願意在下一次補貨前重新協商訂購條件。',
				options: {
					'negotiate-credit': {
						label: '談授信',
						description: '延後付款時點，但要接受些微毛利壓力。'
					},
					'bulk-discount': {
						label: '大量折扣',
						description: '承諾更大的訂單量，以換取更好的單位成本。'
					}
				}
			},
			expansionUnavailable: {
				title: '無法擴店',
				context: '這個連鎖目前最多只能營運 {storeCap} 間店。',
				options: {}
			},
			expansionCashBlocked: {
				title: '擴店延後',
				context: '要再開一間店需要 {cash} 現金。',
				options: {}
			},
			locationUnavailable: {
				title: '地點不可用',
				blockedContext: '{reason} 無法用來展店。請改選其他城市格位。',
				genericContext: '開設新店前，請選擇一個已解鎖且未被占用的城市格位。',
				reasons: {
					locked: '未解鎖地點',
					road: '道路地點',
					river: '河川地點'
				},
				acknowledge: {
					description: '返回選址規劃。'
				},
				options: {}
			},
			industrialConstructionDelayed: {
				title: '工業建設延後',
				contexts: {
					unknownTile: '未知的工業格位。',
					unknownBuildingType: '未知的工業建築類型。',
					lockedTile: '該工業格位尚未解鎖。',
					occupiedTile: '該工業格位已被占用。',
					requiresIndustrialTile: '需要工業用格位。',
					requiresResource: '需要 {resource}。',
					requiresCash: '{buildingName} 需要 {cash} 現金。'
				},
				acknowledge: {
					description: '返回工業規劃。'
				},
				options: {}
			},
			railConstruction: {
				contexts: {
					unknownBuilding: '未知的鐵路建築。',
					crossCity: '鐵路無法跨越不同城市。',
					selfConnected: '鐵路線路需要連接兩座不同的建築。',
					noValidPath: '沒有通往目的地的有效軌道路徑。',
					alreadyConnected: '這些建築物已經由鐵路連接。',
					requiresCash: '鋪設這段鐵路需要 {cost}，但你只有 {cash}。',
					segmentAtMaxLevel: '此鐵路區段已達最高等級。',
					unknownSegment: '未知的鐵路區段。',
					tileHasRail: '此格位已鋪設鐵路。'
				}
			},
			worldCity: {
				cityUnavailable: {
					title: '城市不可用',
					context: '未知的城市。'
				},
				notAvailableYet: {
					title: '這座城市尚未開放',
					context: '開放條件：{requirement}'
				},
				openingDelayed: {
					title: '城市開放延後',
					context: '開啟這座城市需要 {cash} 現金。'
				},
				acknowledge: {
					description: '返回世界地圖。'
				},
				options: {}
			},
			acknowledge: {
				label: '知道了',
				description: '返回營運規劃。'
			}
		},
		productChainGraph: {
			title: {
				warehouseFlow: '城市庫存流向',
				productChain: '{label}鏈'
			},
			warehouseNode: '城市庫存',
			nodeStats: {
				recipe: '{buildings} 棟 · 每日 {output}',
				stock: '庫存 {stock}'
			},
			health: {
				healthy: '健康',
				watch: '注意',
				shortage: '短缺',
				'no-local-capacity': '無本地產能',
				'no-report': '尚無報表'
			},
			emptyReason: {
				noWarehouseData: '目前還沒有城市庫存或每日報表。',
				noLocalChain: '此商品類別目前還沒有本地生產鏈。'
			},
			warnings: {
				noDailyReport: '目前還沒有每日報表，因此無法顯示最新流向。',
				noProductionRecipe: '找不到 {materialName} 的生產配方。'
			},
			edges: {
				in: '每日流入 {quantity}',
				out: '每日流出 {quantity}',
				produced: '每日生產 {actual} · 每循環 {required}',
				used: '每日使用 {actual} · 每循環 {required}',
				producedImported: '每日生產 {actual} · 每循環 {required} · 外部進口',
				usedImported: '每日使用 {actual} · 每循環 {required} · 外部進口'
			},
			bottlenecks: {
				healthy: '{label} 正在本地順暢流動。',
				watch: '{label} 庫存低於最新下游用量。',
				shortage: '{label} 今天依賴外部進口或出現本地短缺。',
				noLocalCapacity: '{label} 沒有已建置的本地生產設施。',
				noReport: '{label} 尚無最新日流量資料。',
				warehouseNoCapacity: '沒有可用的城市庫存容量。',
				warehouseOverflow: '{quantity} 單位正在城市庫存溢出。',
				warehouseAvailable: '城市庫存容量仍有空間。'
			}
		}
	},
	scenarioDefinitions: {
		firstProfit: {
			title: '首次獲利',
			summary: '將小商店發展成獲利事業。',
			briefing: '在期限前達成正收益。',
			strategyHint: '控制成本並建立穩定客群。',
			objectives: { cumulativeNetIncome: '賺取累計淨收入', positiveIncomeStreak: '維持連續正收益' },
			failures: { negativeCash: '避免現金為負' }
		},
		importSqueeze: {
			title: '進口壓力',
			summary: '在進口成本上升時維持獲利。',
			briefing: '完成進口週期並守住利潤。',
			strategyHint: '謹慎規劃訂單並避免過量庫存。',
			objectives: { completedImportCycles: '完成進口週期', cumulativeNetIncome: '賺取累計淨收入' },
			failures: { negativeCash: '避免現金為負' }
		},
		localLifeline: {
			title: '在地生命線',
			summary: '建立韌性的在地供應鏈。',
			briefing: '以在地生產商品供應商店。',
			strategyHint: '平衡生產能力與零售需求。',
			objectives: { localUnits: '供應在地商品', localShare: '達成在地供應占比' },
			failures: { negativeCash: '避免現金為負' }
		}
	},
	scenarioCatalog: {
		title: '挑戰目錄',
		close: '關閉挑戰目錄',
		start: '開始',
		resume: '繼續',
		resumeVersion: '繼續版本 {version}',
		restart: '重新開始',
		startCurrent: '開始目前版本',
		confirmReplacement: '確認取代',
		cancel: '取消',
		shareCode: '分享代碼',
		importCode: '匯入代碼',
		copyCode: '複製 {title} 的代碼',
		copySuccess: '已複製分享代碼。',
		copyFailure: '無法複製分享代碼。',
		retry: '重試',
		olderVersionConfirmation: '開始目前版本會取代進行中的舊版挑戰。',
		importReplacementConfirmation: '要取代進行中的挑戰嗎？',
		startReplacementConfirmation: '開始此挑戰會取代進行中的挑戰。',
		best: '最佳',
		noBest: '尚無排名結果',
		priorVersion: '舊版結果',
		dayLimit: '{days} 天期限',
		allowedContent: '{cities} 個城市、{stores} 種商店、{products} 種商品',
		challengeDetails: '挑戰詳情',
		restartChallenge: '重新開始挑戰',
		catalog: '挑戰目錄',
		returnSandbox: '返回沙盒',
		abandon: '放棄挑戰',
		confirmAbandon: '確認放棄'
	},
	scenarioStatus: {
		officialSeed: '官方種子 {seed}',
		customSeed: '自訂種子 {seed}',
		ranked: '計入排名',
		unranked: '不計排名',
		activeVersion: '進行中版本 {active}（目前版本 {current}）',
		versionEligibility: '版本 {version} · {eligibility}',
		day: '第 {day} 天，共 {limit} 天',
		remaining: { one: '剩餘 {count} 天', other: '剩餘 {count} 天' },
		requiredProgress: '必要 {complete}/{total}',
		optionalProgress: '選擇 {complete}/{total}',
		projectedScore: '預計分數 {score} 分',
		projectedMedal: '預計獎牌 {medal}',
		deadlineRisk: { one: '期限：剩餘 {count} 天', other: '期限：剩餘 {count} 天' },
		conditionRisk: '失敗風險：距界線 {distance} · {status}',
		progressAnnouncement: '已更新第 {day} 天的挑戰進度。',
		showDetails: '顯示目標詳情',
		hideDetails: '隱藏目標詳情',
		dismiss: '關閉'
	},
	scenarioObjectives: {
		heading: '目標',
		required: '必要',
		optional: '選擇',
		requiredHeading: '必要目標',
		optionalHeading: '選擇目標',
		failuresHeading: '失敗條件',
		actualTarget: '目前 {actual} · 目標 {target}',
		contributors: '貢獻項目',
		noContributors: '沒有貢獻記錄',
		reportContributor: '第 {day} 天報告',
		status: {
			pending: '進行中',
			satisfied: '已達成',
			missed: '未達成',
			inactive: '未觸發',
			triggered: '已觸發'
		},
		windows: {
			current: '目前數值',
			runToDate: '挑戰至今',
			trailingReports: '最近 {count} 份報告',
			fixedReportDays: '報告日 {start}–{end}'
		}
	},
	scenarioResults: {
		title: '挑戰結果',
		points: '{score} 分',
		bronze: '銅牌',
		silver: '銀牌',
		gold: '金牌',
		noMedal: '無獎牌',
		outcome: {
			completed: '挑戰完成',
			failed: '挑戰失敗',
			abandoned: '挑戰已放棄'
		},
		newBest: '刷新最佳成績',
		bestUnchanged: '最佳成績未變',
		nextMedal: '距離{medal}還差 {points} 分',
		deadlineNotTriggered: '未觸及期限：第 {day} 天，共 {limit} 天',
		deadlineTriggered: '第 {day} 天觸及期限',
		announcement: '{outcome}，獲得 {score} 分。',
		close: '關閉結果'
	},
	scenarioDiagnostics: {
		invalidBuiltIn: '內建挑戰無效：{detail}',
		malformedShareCode: '分享代碼格式錯誤。',
		unknownScenario: '未知的挑戰。',
		unsupportedVersion: '不支援的挑戰版本。',
		invalidSeed: '挑戰種子無效。',
		checksumMismatch: '分享代碼校驗碼不符。',
		invalidDefinition: '挑戰定義無效。',
		setupInvariantFailed: '無法建立挑戰。',
		staleDefinition: '此挑戰版本無法使用。',
		persistenceReadFailed: '無法載入挑戰。',
		persistenceWriteFailed: '無法儲存挑戰。',
		missingRun: '進行中的挑戰無法使用。',
		forbiddenCommand: '此挑戰不允許這項操作。',
		forbiddenContent: '此挑戰不允許這項內容。',
		invalidCommand: '此操作對目前狀態無效。',
		terminalRun: '此挑戰已結束。'
	},
	scenarioModifiers: { importCostMultiplier: '進口成本 ×{multiplier}' },
	placement: {
		chooseHighlightedTile: '請選擇已高亮的地塊來建設。',
		retail: {
			unknownCityTile: '未知的城市地塊',
			storeLimitReached: '已達商店上限',
			requiresCash: '需要 {amount} 現金',
			occupiedLocation: '位置已被占用',
			lockedLocation: '位置尚未解鎖',
			roadLocation: '道路位置',
			riverLocation: '河川位置',
			noValidTiles: '沒有可用地塊'
		},
		industry: {
			lockedUntilRetail: '先開設零售店才能解鎖建設。',
			unknownBuildingType: '未知的工業建築類型',
			requiresCash: '{buildingName} 需要 {amount} 現金。'
		}
	}
} as const satisfies Messages;
