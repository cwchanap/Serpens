import { en } from './en';

export const zhHant = {
	...en,
	app: {
		title: 'Serpens'
	},
	topBar: {
		day: '第 {day} 天',
		cash: '現金',
		alerts: '警示',
		noAlerts: '沒有警示'
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
		build: '建設',
		management: '管理',
		shortcuts: '快捷鍵',
		advanceDay: '推進一天'
	},
	game: {
		...en.game,
		archetypes: {
			...en.game.archetypes,
			convenience: {
				...en.game.archetypes.convenience,
				name: '便利商店',
				description: '週轉快、人流穩定，但利潤較薄且容易受到缺貨影響。',
				risks: {
					0: '缺貨',
					1: '低利潤',
					2: '高人流壓力'
				}
			}
		},
		products: {
			...en.game.products,
			'bottled-water': '瓶裝水'
		},
		materials: {
			...en.game.materials,
			'bottled-water': '瓶裝水'
		},
		policyValues: {
			...en.game.policyValues,
			service: {
				...en.game.policyValues.service,
				highTouch: '高接觸服務'
			}
		},
		worldCities: {
			...en.game.worldCities,
			'harbor-city': {
				...en.game.worldCities['harbor-city'],
				name: '港灣城',
				unlockRequirement: '起始零售城市',
				specialtySummary: '均衡的起始市場，日常需求穩定。'
			},
			'campus-junction': {
				...en.game.worldCities['campus-junction'],
				name: '校園匯點',
				unlockRequirement: '擁有 2 間店或到達第 7 天。',
				specialtySummary: '學生族群密集，偏好電子產品、遊戲、配件與禮品。'
			}
		},
		mapViews: {
			world: '世界',
			retail: '零售',
			industry: '工業'
		},
		managementPanels: {
			...en.game.managementPanels,
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
		...en.copy,
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
			...en.copy.decisions,
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
			acknowledge: {
				label: '知道了',
				description: '返回營運規劃。'
			}
		},
		productChainGraph: {
			...en.copy.productChainGraph,
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
				noDailyReport: '目前還沒有每日報表，因此無法顯示最新流向。'
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
	}
} as const;
