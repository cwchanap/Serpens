import { en } from './en';

export const ja = {
	...en,
	app: {
		title: 'Serpens'
	},
	topBar: {
		day: '{day}日目',
		cash: '現金',
		alerts: '通知',
		noAlerts: '通知なし'
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
		build: '建設',
		management: '管理',
		shortcuts: 'ショートカット',
		advanceDay: '次の日へ'
	},
	game: {
		...en.game,
		archetypes: {
			...en.game.archetypes,
			convenience: {
				...en.game.archetypes.convenience,
				name: 'コンビニエンスストア',
				description: '回転が速く、客足は安定しているが、利幅が薄く欠品に弱い業態です。',
				risks: {
					0: '欠品',
					1: '低利益率',
					2: '高い来店圧力'
				}
			}
		},
		products: {
			...en.game.products,
			'bottled-water': 'ボトルウォーター'
		},
		materials: {
			...en.game.materials,
			'bottled-water': 'ボトルウォーター'
		},
		policyValues: {
			...en.game.policyValues,
			service: {
				...en.game.policyValues.service,
				highTouch: '手厚い接客'
			}
		},
		worldCities: {
			...en.game.worldCities,
			'harbor-city': {
				...en.game.worldCities['harbor-city'],
				name: 'ハーバーシティ',
				unlockRequirement: '開始時から使える小売都市',
				specialtySummary: '日用品需要が安定した、バランス型の開始都市です。'
			},
			'campus-junction': {
				...en.game.worldCities['campus-junction'],
				name: 'キャンパスジャンクション',
				unlockRequirement: '店舗を2店開くか、7日目に到達する。',
				specialtySummary:
					'学生街の需要が強く、電子機器、ゲーム、アクセサリー、ギフトに向いています。'
			}
		},
		mapViews: {
			world: '世界',
			retail: '小売',
			industry: '工業'
		},
		managementPanels: {
			...en.game.managementPanels,
			dashboard: 'ダッシュボード',
			policies: '方針',
			staff: 'スタッフ',
			stores: '店舗',
			decisions: '意思決定',
			reports: 'レポート',
			productChains: '製品チェーン'
		}
	},
	copy: {
		...en.copy,
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
			factoryBlocked: '{buildingName} は原料不足です'
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
			...en.copy.decisions,
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
			acknowledge: {
				label: '確認',
				description: '運営計画に戻る。'
			}
		},
		productChainGraph: {
			...en.copy.productChainGraph,
			title: {
				warehouseFlow: '倉庫フロー',
				productChain: '生産チェーン'
			},
			warehouseNode: '倉庫',
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
				noDailyReport: '日次レポートがまだないため、最新日のフローは表示できません。'
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
	}
} as const;
