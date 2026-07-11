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
		warehouseSummary: '倉庫摘要',
		warehouse: '倉庫',
		warehouseMaterials: '倉庫物料',
		capacity: '容量',
		used: '已使用',
		overflowUnits: '溢出單位',
		overflowCost: '溢出成本',
		noMaterialsStored: '沒有已儲存的物料',
		unknownBuildingType: '未知的工業建築類型',
		status: {
			idle: '閒置',
			produced: '已生產',
			'imported-inputs': '已進口投入',
			blocked: '受阻'
		}
	},
	worldMap: {
		ariaLabel: '世界地圖',
		cities: '城市列表',
		cityDetails: '城市詳情',
		closeCityDetails: '關閉城市詳情',
		cityEyebrow: {
			retail: '零售城市',
			industry: '工業城市'
		},
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
		expiresDay: '第 {day} 天到期'
	},
	policyPanel: {
		title: '政策'
	},
	reportsPanel: {
		title: '報表',
		metrics: {
			latestDailyResult: '最新每日結果',
			revenue: '營收',
			cashAfter: '結束現金',
			payroll: '薪資',
			imports: '進口',
			productionImports: '生產進口',
			warehouseOverflow: '倉庫溢出',
			sevenDayNet: '7 日淨利',
			thirtyDayNet: '30 日淨利'
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
		defaultName: '店鋪 #{ordinal}'
	},
	storeOverview: {
		title: '店鋪',
		dayOpen: '第 {day} 天',
		metrics: {
			revenue: '營收',
			grossMargin: '毛利',
			stock: '庫存',
			imports: '進口',
			staff: '員工',
			coverage: '覆蓋'
		},
		productSources: '{storeName}商品來源分布',
		warnings: '{storeName}警告',
		warehouseUnits: '倉庫 {count}',
		importedUnits: '進口 {count}',
		noWarnings: '目前沒有警告。'
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
		warehouseFlow: '倉庫流向',
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
			autoSavedDay: '已自動儲存第 {day} 天',
			noAutoSaveFound: '找不到自動存檔',
			loadedAutoSave: '已載入自動存檔',
			savedManualSlot: '已儲存 {name}',
			manualSlotNotFound: '找不到手動存檔槽',
			loadedManualSlot: '已載入 {name}',
			deletedManualSlot: '已刪除存檔槽'
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
			productChains: '產品鏈'
		}
	},
	copy: {
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
			factoryBlocked: '{buildingName} 缺少投入原料'
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
				options: {}
			},
			acknowledge: {
				label: '知道了',
				description: '返回營運規劃。'
			}
		},
		productChainGraph: {
			title: {
				warehouseFlow: '倉庫流向',
				productChain: '產品鏈'
			},
			warehouseNode: '倉庫',
			health: {
				healthy: '健康',
				watch: '注意',
				shortage: '短缺',
				'no-local-capacity': '無本地產能',
				'no-report': '尚無報表'
			},
			emptyReason: {
				noWarehouseData: '目前還沒有倉庫存量或每日報表。',
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
				producedImported: '每日生產 {actual} · 每循環 {required} · 進口',
				usedImported: '每日使用 {actual} · 每循環 {required} · 進口'
			},
			bottlenecks: {
				healthy: '{label} 正在本地順暢流動。',
				watch: '{label} 庫存低於最新下游用量。',
				shortage: '{label} 今天依賴進口或出現本地短缺。',
				noLocalCapacity: '{label} 沒有已建置的本地生產設施。',
				noReport: '{label} 尚無最新日流量資料。',
				warehouseNoCapacity: '沒有可用的倉庫容量。',
				warehouseOverflow: '{quantity} 單位正在溢出存放。',
				warehouseAvailable: '倉庫容量仍有空間。'
			}
		}
	},
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
} as const;
