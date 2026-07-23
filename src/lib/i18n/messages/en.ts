export const en = {
	app: {
		title: 'Serpens'
	},
	topBar: {
		statusBar: 'Status bar',
		day: 'Day {day}',
		cash: 'Cash',
		alerts: 'Alerts',
		noAlerts: 'No alerts',
		alertCount: {
			one: '{count} alert',
			other: '{count} alerts'
		},
		alertsList: 'Alerts list'
	},
	gameMenu: {
		menu: 'Menu',
		mapView: 'Map view',
		language: 'Language',
		saves: 'Saves',
		views: {
			retail: 'Retail',
			industry: 'Industry',
			world: 'World'
		}
	},
	controlDesk: {
		group: 'Control desk',
		build: 'Build',
		management: 'Management',
		shortcuts: 'Shortcuts',
		advanceDay: 'Advance day'
	},
	audioSettings: {
		group: 'Audio settings',
		title: 'Audio',
		bgm: 'BGM',
		music: 'Music',
		musicVolume: 'Music volume',
		sfx: 'SFX',
		effects: 'Effects',
		effectsVolume: 'Effects volume'
	},
	buildMenu: {
		dialog: 'Build menu',
		close: 'Close build menu',
		unavailable: 'Unavailable',
		cityEyebrow: {
			retail: 'Retail city',
			industry: 'Industry city'
		},
		title: {
			retail: 'Build Retail',
			industry: 'Build Industry'
		},
		retail: {
			buildArchetype: 'Build {name}',
			setupRevenue: 'Setup {setup} | Revenue {revenue}/day',
			rangeFormat: '{min}–{max}',
			validTiles: {
				one: '{count} valid tile',
				other: '{count} valid tiles'
			},
			noOptions: 'No retail buildings available'
		},
		industry: {
			filter: {
				allProducts: 'Filter: All products',
				selected: 'Filter: {name}',
				clear: 'Clear product filter',
				dialog: 'Product chain filter',
				title: 'Product filter',
				close: 'Close product chain filter',
				search: 'Search products',
				allProductsLabel: 'All products',
				allBuildings: 'All industrial buildings',
				chainBuildings: {
					one: '{count} chain building',
					other: '{count} chain buildings'
				},
				noChain: 'No industry chain yet',
				noMatches: 'No matching products'
			},
			supplyAdvisor: 'Supply Advisor — what should I build?',
			buildType: 'Build {name}',
			starter: 'Starter',
			costOperating: 'Cost {cost} | Operating {operating}/day',
			recipe: 'Recipe',
			needsProducer: 'Needs {producer}',
			needsResource: 'Needs a {resource} resource tile',
			noOptions: 'No industrial buildings available'
		}
	},
	tileInspector: {
		ariaLabel: 'Tile inspector',
		close: 'Close tile inspector',
		selectTile: 'Select a city tile',
		tileHeading: 'Tile {x}, {y}',
		storeVitals: 'Store vitals',
		revenuePerDay: 'Revenue/day',
		stockHealth: 'Stock health',
		staffMorale: 'Staff morale',
		level: 'Level {level} / {max}',
		nextLabel: 'Next: {benefit}',
		nextBenefit: {
			unlockProductStaff: 'Unlocks product #{productNumber} + {staffCapacity} staff capacity',
			revenue: '+10% revenue'
		},
		upgrade: 'Upgrade — {cost}',
		maxLevel: 'Max level',
		notEnoughCash: 'Not enough cash.',
		openDetails: 'Open Details ▸',
		tileStats: 'Tile stats',
		demand: 'Demand',
		rent: 'Rent',
		footTraffic: 'Foot traffic',
		customerFit: 'Customer fit'
	},
	industryTileInspector: {
		ariaLabel: 'Industry tile inspector',
		close: 'Close industry tile inspector',
		emptyTitle: 'Industry tile',
		noTileSelected: 'No tile selected',
		eyebrow: 'Industry tile',
		heading: 'Industry Tile {x}, {y}',
		statsAria: 'Industry tile stats',
		unknown: 'Unknown',
		none: 'None',
		terrain: 'Terrain',
		resource: 'Resource',
		coordinates: 'Coordinates',
		access: 'Access',
		locked: 'Locked',
		open: 'Open',
		detailsAria: 'Industrial building details',
		statusLabel: 'Status',
		producedTotal: 'Produced total',
		importedInputs: 'Imported inputs',
		blockedDays: 'Blocked days',
		level: 'Level {level} / {max}',
		output: '{multiplier}× output',
		upgrade: 'Upgrade — {cost}',
		maxLevel: 'Max level',
		notEnoughCash: 'Not enough cash.',
		lastProduction: 'Last production',
		noOutputYet: 'No output yet',
		buffer: 'Buffer',
		noBufferMaterials: 'No materials buffered',
		warehouseSummary: 'Warehouse summary',
		warehouse: 'Warehouse',
		warehouseMaterials: 'Warehouse materials',
		capacity: 'Capacity',
		used: 'Used',
		overflowUnits: 'Overflow units',
		overflowCost: 'Overflow cost',
		noMaterialsStored: 'No materials stored',
		unknownBuildingType: 'Unknown building type',
		status: {
			idle: 'Idle',
			produced: 'Produced',
			'imported-inputs': 'Imported inputs',
			stalled: 'Stalled (buffer full)',
			blocked: 'Blocked'
		}
	},
	railBuild: {
		toolbar: 'Build rail',
		pickOrigin: 'Select the first building',
		pickDestination: 'Select waypoints, then the destination building',
		confirm: '{cells} new cells · {cost}'
	},
	railSegmentInspector: {
		eyebrow: 'Rail',
		title: 'Rail segment',
		cells: 'Cells',
		level: 'Level',
		capacity: 'Capacity per day',
		utilization: 'Utilization yesterday',
		upgrade: 'Upgrade ({cost})',
		demolish: 'Demolish (+{refund})',
		pickSegment: 'Junction — pick a segment',
		atMaxLevel: 'At max level',
		notEnoughCash: 'Not enough cash.',
		cannotDemolish: 'All cells are shared junctions — nothing to remove.'
	},
	worldMap: {
		ariaLabel: 'World map',
		cities: 'Cities',
		cityDetails: 'City details',
		closeCityDetails: 'Close city details',
		cityEyebrow: {
			retail: 'Retail city',
			industry: 'Industrial city'
		},
		selectionPending: 'Finishing the current challenge action before changing cities.',
		selectionUnavailable: 'Changing cities is unavailable in this challenge.',
		openForCash: 'Open for {cash} cash'
	},
	savePanel: {
		dismiss: 'Dismiss saves',
		dialog: 'Saves',
		eyebrow: 'Saves',
		title: 'Desktop Saves',
		close: 'Close',
		autoSection: 'Auto-save',
		autoSave: 'Auto-save',
		autoChip: 'AUTO',
		noAutoSave: 'No auto-save yet.',
		resume: 'Resume',
		createSection: 'Create save slot',
		newSlot: 'New slot',
		slotName: 'Slot name',
		saveSlot: 'Save slot',
		manualSection: 'Manual save slots',
		manualSlots: 'Manual slots',
		load: 'Load',
		overwrite: 'Overwrite',
		delete: 'Delete',
		noManualSlots: 'No manual slots yet.',
		storeCount: {
			one: '{count} store',
			other: '{count} stores'
		},
		autoSlotDetails: 'Day {day} · {storeCount} · {updatedAt}',
		manualSlotDetails: 'Day {day} · {city} · {storeCount} · {updatedAt}'
	},
	decisionQueue: {
		title: 'Decision Queue',
		empty: 'No urgent decisions today.',
		expiresDay: 'Expires day {day}'
	},
	policyPanel: {
		title: 'Policies'
	},
	reportsPanel: {
		title: 'Reports',
		metrics: {
			latestDailyResult: 'Latest daily result',
			revenue: 'Revenue',
			cashAfter: 'Cash after',
			payroll: 'Payroll',
			imports: 'Imports',
			productionImports: 'Production imports',
			warehouseOverflow: 'Warehouse overflow',
			railShipments: 'Rail shipments',
			sevenDayNet: '7-day net',
			thirtyDayNet: '30-day net'
		},
		dailyWarnings: 'Daily warnings',
		empty: 'No reports yet. Advance the first day to generate results.'
	},
	scorecard: {
		title: 'Scorecard'
	},
	staffPanel: {
		title: 'Staff',
		hiredCount: '{count} hired staff',
		candidates: 'Candidates',
		unassigned: 'Unassigned',
		storeStaffing: 'Store staffing',
		assigned: 'Assigned',
		coverage:
			'{storeName}: {managerAssigned}/{managerRequired} managers, {generalAssigned}/{generalRequired} general',
		coverageShort:
			'{managerAssigned}/{managerRequired} mgr, {generalAssigned}/{generalRequired} gen',
		role: {
			manager: 'Manager',
			general: 'General'
		},
		metrics: {
			level: 'Level',
			skill: 'Skill',
			morale: 'Morale'
		},
		salaryPerMonth: '{salary}/mo',
		hireButton: 'Hire {name}',
		assignButton: 'Assign',
		unassignButton: 'Unassign',
		promoteButton: 'Promote {name} ({cost})',
		emptyCandidates: 'No candidates available',
		emptyUnassigned: 'No unassigned staff',
		emptyAssigned: 'No assigned staff',
		assignment: {
			unassigned: 'Unassigned',
			currentlyUnassigned: 'currently unassigned',
			currentlyAssigned: 'currently assigned to {storeName}'
		},
		actionLabels: {
			hire: 'Hire {name}, {role} candidate {id}',
			assign: 'Assign {name}, {role} staff {id}, {context}',
			assignToStore: 'Assign {name}, {role} staff {id} to {storeName}',
			unassign: 'Unassign {name}, {role} staff {id} from {storeName}',
			promote: 'Promote {name}, {role} staff {id} to level {level} for {cost}'
		},
		levelProgress: {
			max: 'Max level',
			xp: 'XP {current}/{required}',
			inline: '{role} · Lvl {level} · Skill {skill} · Morale {morale}',
			storeInline: '{role} · Skill {skill} · Morale {morale}'
		}
	},
	store: {
		defaultName: 'Store #{ordinal}',
		location: '{neighborhood} ({x}, {y})'
	},
	storeOverview: {
		title: 'Stores',
		dayOpen: 'Day {day}',
		metrics: {
			revenue: 'Revenue',
			grossMargin: 'Gross margin',
			stock: 'Stock',
			imports: 'Imports',
			staff: 'Staff',
			coverage: 'Coverage'
		},
		productSources: '{storeName} product source split',
		warnings: '{storeName} warnings',
		warehouseUnits: '{count} warehouse',
		importedUnits: '{count} imported',
		noWarnings: 'No current warnings.'
	},
	storeStockTable: {
		title: '{storeName} stock',
		headings: {
			product: 'Product',
			stock: 'Stock',
			importCost: 'Import cost',
			sellingPrice: 'Selling price',
			reorder: 'Reorder',
			target: 'Target',
			status: 'Status',
			latest: 'Latest'
		},
		inputLabels: {
			sellingPrice: 'Selling price for {categoryName}',
			reorderThreshold: 'Reorder threshold for {categoryName}',
			targetStock: 'Target stock for {categoryName}'
		},
		latestReport: '{sold} sold / {missed} missed',
		noReport: 'No report'
	},
	storeDetail: {
		dismiss: 'Dismiss store details',
		eyebrow: 'Store details',
		staffTitle: '{storeName} staff',
		close: 'Close',
		closeLabel: 'Close store details',
		sections: '{storeName} sections',
		tabs: {
			stock: 'Stock',
			chain: 'Product Chain',
			staff: 'Staff'
		}
	},
	storeProductChainPanel: {
		ariaLabel: '{storeName} product chain',
		categoryLabel: 'Product category',
		empty: "No local production chain available for this store's categories yet."
	},
	productChainsPanel: {
		ariaLabel: 'Product Chains',
		eyebrow: 'Folio II · Production Chain',
		modeGroup: 'Product chain view',
		storeCategoryChains: 'Store category chains',
		warehouseFlow: 'Warehouse flow',
		emptyCategories: 'No store categories have local production chains yet.',
		emptyGraph: 'No chain graph is available.'
	},
	supplyAdvisor: {
		dismiss: 'Dismiss supply advisor',
		dialog: 'Supply advisor',
		eyebrow: 'Industry',
		title: 'Supply Advisor',
		close: 'Close',
		closeLabel: 'Close supply advisor',
		empty: 'Nothing to plan — build a retail store to create demand.',
		chainLabel: '{categoryName} supply chain',
		starter: 'Starter',
		supplied: 'Supplied ✓',
		build: 'Build {buildingName}'
	},
	shortcutCheatSheet: {
		dismiss: 'Dismiss keyboard shortcuts',
		dialog: 'Keyboard shortcuts',
		title: 'Keyboard Shortcuts',
		close: 'Close shortcuts',
		actions: {
			build: 'Toggle build menu',
			mapViews: 'Retail / Industry / World view',
			dashboard: 'Toggle Dashboard',
			policies: 'Toggle Policies',
			staff: 'Toggle Staff',
			stores: 'Toggle Stores',
			decisions: 'Toggle Decisions',
			reports: 'Toggle Reports',
			productChains: 'Toggle Product Chains',
			advanceDay: 'Advance day',
			escape: 'Open menu, or close / cancel',
			cheatSheet: 'Toggle this cheat sheet'
		}
	},
	productChainAtlas: {
		emptyNodes: 'No graph nodes are available for this chain.',
		warnings: '{title} warnings'
	},
	mapRenderer: {
		cityMapAriaLabel: 'City map',
		industryMapAriaLabel: 'Industry map',
		cityMapUnavailable: 'Map renderer unavailable.',
		industryMapUnavailable: 'Industry map renderer unavailable.'
	},
	atlas: {
		categoryIndex: {
			ariaLabel: 'Product category index',
			tier: 'Tier {tier}',
			metrics: 'stock {stock} · made {produced}/d · sold {consumed}/d'
		},
		nodeBroadside: {
			inspected: 'Inspected node',
			emptyTitle: 'Chain node',
			empty: 'Select a graph node to inspect its latest flow metrics.',
			sharedProducer: 'Shared producer — drawn in {count} branches of this chain.',
			metrics: {
				buildings: 'Buildings',
				capacity: 'Capacity',
				capacityValue: '{output} out / {input} in',
				produced: 'Produced',
				consumed: 'Consumed',
				imported: 'Imported',
				sold: 'Sold',
				missed: 'Missed',
				stock: 'Stock'
			}
		},
		legend: {
			title: '· Routes ·',
			healthy: 'Healthy flow',
			shortage: 'Shortage'
		}
	},
	route: {
		cityPlanning: 'City planning',
		mapEyebrow: {
			retail: 'Retail City Map',
			industry: 'Industry City Map',
			world: 'World Map'
		},
		mapTitle: {
			world: 'Regional Network'
		},
		menu: {
			management: 'Management',
			managementPanels: 'Management panels'
		},
		inspectors: {
			retailDetails: 'Tile details',
			industryDetails: 'Industry tile details'
		},
		placement: {
			status: 'Placement status',
			cancel: 'Cancel'
		},
		controlTower: {
			eyebrow: 'Management',
			close: 'Close',
			dismiss: 'Dismiss {panel}',
			closePanel: 'Close {panel}',
			panelStatus: '{panel} status'
		},
		save: {
			errorGeneric: 'Save operation failed',
			errorCorrupt: 'Saved data is corrupt or from an incompatible version',
			errorStorageUnavailable: 'Save storage is unavailable in this browser',
			errorSlotNotFound: 'Save slot not found',
			autoSavedDay: 'Auto-saved day {day}',
			noAutoSaveFound: 'No auto-save found',
			loadedAutoSave: 'Loaded auto-save',
			savedManualSlot: 'Saved {name}',
			manualSlotNotFound: 'Manual save slot not found',
			loadedManualSlot: 'Loaded {name}',
			deletedManualSlot: 'Deleted save slot'
		}
	},
	game: {
		archetypes: {
			convenience: {
				name: 'Convenience Store',
				description: 'Fast turnover, steady foot traffic, low margins, and stockout sensitivity.',
				risks: {
					0: 'Stockouts',
					1: 'Low margins',
					2: 'High foot traffic pressure'
				}
			},
			boutique: {
				name: 'Boutique Goods',
				description:
					'Curated products, customer taste, reputation sensitivity, and premium upside.',
				risks: {
					0: 'Trend mismatch',
					1: 'Reputation swings',
					2: 'Premium service expectations'
				}
			},
			electronics: {
				name: 'Electronics & Games',
				description: 'Higher-ticket sales, trend spikes, launches, and shrink risk.',
				risks: {
					0: 'Launch volatility',
					1: 'Shrink',
					2: 'Expensive inventory'
				}
			},
			grocery: {
				name: 'Grocery Market',
				description:
					'Recurring demand, freshness pressure, broad categories, and supply complexity.',
				risks: {
					0: 'Freshness',
					1: 'Waste',
					2: 'Staffing pressure'
				}
			}
		},
		products: {
			'bottled-water': 'Bottled Water',
			snacks: 'Snacks',
			drinks: 'Drinks',
			essentials: 'Essentials',
			household: 'Household',
			apparel: 'Apparel',
			'home-goods': 'Home Goods',
			gifts: 'Gifts',
			'fashion-accessories': 'Fashion Accessories',
			games: 'Games',
			accessories: 'Accessories',
			devices: 'Devices',
			peripherals: 'Peripherals',
			produce: 'Produce',
			pantry: 'Pantry',
			prepared: 'Prepared Food',
			bakery: 'Bakery'
		},
		materials: {
			grain: 'Grain',
			salt: 'Salt',
			oilseeds: 'Oilseeds',
			water: 'Water',
			fruit: 'Fruit',
			sugar: 'Sugar',
			pulpwood: 'Pulpwood',
			'chemical-feedstock': 'Chemical Feedstock',
			flour: 'Flour',
			'cooking-oil': 'Cooking Oil',
			'filtered-water': 'Filtered Water',
			syrup: 'Syrup',
			'paper-pulp': 'Paper Pulp',
			plastic: 'Plastic',
			packaging: 'Packaging',
			'cleaning-base': 'Cleaning Base',
			snacks: 'Snacks',
			drinks: 'Drinks',
			essentials: 'Essentials',
			gifts: 'Gifts',
			'bottled-water': 'Bottled Water',
			produce: 'Produce',
			pantry: 'Pantry Goods'
		},
		industrialBuildings: {
			'grain-farm': 'Grain Farm',
			'salt-mine': 'Salt Mine',
			'oilseed-farm': 'Oilseed Farm',
			'water-pump': 'Water Pump',
			'fruit-farm': 'Fruit Farm',
			'sugar-farm': 'Sugar Farm',
			'pulpwood-grove': 'Pulpwood Grove',
			'chemical-feedstock-well': 'Chemical Feedstock Well',
			'flour-mill': 'Flour Mill',
			'oil-press': 'Oil Press',
			'water-filtration-plant': 'Water Filtration Plant',
			'syrup-plant': 'Syrup Plant',
			'pulp-mill': 'Pulp Mill',
			'plastic-plant': 'Plastic Plant',
			'packaging-plant': 'Packaging Plant',
			'chemical-plant': 'Chemical Plant',
			'snack-factory': 'Snack Factory',
			'drink-bottling-plant': 'Drink Bottling Plant',
			'household-goods-factory': 'Household Goods Factory',
			'gift-workshop': 'Gift Workshop',
			'water-bottler': 'Water Bottler',
			'produce-packhouse': 'Produce Packhouse',
			'pantry-works': 'Pantry Works',
			warehouse: 'Warehouse'
		},
		industryResources: {
			'grain-field': 'Grain Field',
			'salt-deposit': 'Salt Deposit',
			'oilseed-field': 'Oilseed Field',
			'water-source': 'Water Source',
			'fruit-orchard': 'Fruit Orchard',
			'sugar-field': 'Sugar Field',
			'pulpwood-forest': 'Pulpwood Forest',
			'chemical-feedstock': 'Chemical Feedstock'
		},
		neighborhoods: {
			downtown: 'Downtown',
			campus: 'Campus',
			residential: 'Residential',
			mall: 'Mall',
			transit: 'Transit',
			industrial: 'Industrial',
			suburb: 'Suburb',
			parkEdge: 'Park Edge'
		},
		terrain: {
			commercial: 'Commercial',
			residential: 'Residential',
			green: 'Green',
			transit: 'Transit',
			industrial: 'Industrial'
		},
		tileFeatures: {
			road: 'Road',
			river: 'River'
		},
		industryTerrain: {
			farmland: 'Farmland',
			forest: 'Forest',
			water: 'Water',
			deposit: 'Deposit',
			industrial: 'Industrial',
			blocked: 'Blocked'
		},
		policyFields: {
			pricing: 'Pricing',
			inventory: 'Inventory',
			staffing: 'Staffing',
			marketing: 'Marketing',
			service: 'Service'
		},
		policyValues: {
			pricing: {
				discount: 'Discount',
				competitive: 'Competitive',
				standard: 'Standard',
				premium: 'Premium'
			},
			inventory: {
				lean: 'Lean',
				balanced: 'Balanced',
				generous: 'Generous'
			},
			staffing: {
				minimal: 'Minimal',
				efficient: 'Efficient',
				service: 'Service'
			},
			marketing: {
				none: 'None',
				awareness: 'Awareness',
				promotions: 'Promotions',
				loyalty: 'Loyalty'
			},
			service: {
				speed: 'Speed',
				balanced: 'Balanced',
				highTouch: 'High Touch'
			}
		},
		scoreKeys: {
			profit: 'Profit',
			customerSatisfaction: 'Customer Satisfaction',
			staffMorale: 'Staff Morale',
			marketPosition: 'Market Position'
		},
		worldCities: {
			'harbor-city': {
				name: 'Harbor City',
				unlockRequirement: 'Starter retail city',
				specialtySummary: 'Balanced starter market with steady everyday demand.'
			},
			'campus-junction': {
				name: 'Campus Junction',
				unlockRequirement: 'Reach 2 stores or day 7.',
				specialtySummary:
					'Student-heavy districts favor electronics, games, accessories, and gifts.'
			},
			'garden-borough': {
				name: 'Garden Borough',
				unlockRequirement: 'Reach 4 stores or hold positive cash after daily reports.',
				specialtySummary:
					'Residential neighborhoods favor groceries, essentials, and convenience goods.'
			},
			'industry-city': {
				name: 'Industry City',
				unlockRequirement: 'Starter industrial city',
				specialtySummary: 'Balanced starter resources with broad processing room.'
			},
			'breadbasket-basin': {
				name: 'Breadbasket Basin',
				unlockRequirement: 'Build a warehouse and one raw producer.',
				specialtySummary: 'Food-chain resource basin for grain, oilseeds, fruit, and sugar.'
			},
			'quarry-works': {
				name: 'Quarry Works',
				unlockRequirement: 'Produce a finished material locally.',
				specialtySummary:
					'Extraction and factory district for salt, chemicals, pulpwood, and packaging chains.'
			}
		},
		mapViews: {
			world: 'World',
			retail: 'Retail',
			industry: 'Industry'
		},
		managementPanels: {
			dashboard: 'Dashboard',
			policies: 'Policies',
			staff: 'Staff',
			stores: 'Stores',
			decisions: 'Decisions',
			reports: 'Reports',
			productChains: 'Product Chains'
		}
	},
	copy: {
		stockStatus: {
			healthy: 'Healthy',
			needsImport: 'Needs import',
			outOfStock: 'Out of stock'
		},
		stockTrouble: {
			outOfStock: {
				one: '{count} product out of stock',
				other: '{count} products out of stock'
			},
			needsImport: {
				one: '{count} product needs import',
				other: '{count} products need import'
			}
		},
		alerts: {
			storeStock: '{storeName}: {summary}',
			decision: 'Decision: {title}',
			factoryBlocked: '{buildingName} starved of inputs'
		},
		reportWarnings: {
			stockPressure: '{storeName} has stock pressure',
			nearStaffCapacity: '{storeName} is near staff capacity',
			shortManager: '{storeName} is short {count} manager',
			shortGeneral: '{storeName} is short {count} general staff',
			missedProductDemand: '{storeName} missed product demand',
			reputationSlipping: '{storeName} reputation is slipping',
			cashReservesLow: 'cash reserves are low'
		},
		worldCity: {
			kind: {
				retail: 'Retail',
				industry: 'Industry'
			},
			state: {
				opened: 'Opened',
				revealed: 'Ready to open',
				locked: 'Locked'
			},
			blockedOpeningCost: 'Opening this city requires {cash} cash.',
			openedSummary: '{storeCount} stores - {buildingCount} industrial buildings'
		},
		decisions: {
			cashPressure: {
				title: 'Cash pressure',
				context:
					'Cash is below zero. Choose how to keep operations moving while protecting the brand.',
				options: {
					'short-loan': {
						label: 'Short loan',
						description: 'Add emergency working capital and accept pressure on profitability.'
					},
					'cut-costs': {
						label: 'Cut costs',
						description: 'Trim discretionary spend and inventory depth to stabilize cash.'
					},
					'hold-course': {
						label: 'Hold course',
						description: "Avoid reactive changes and let tomorrow's sales carry the business."
					}
				}
			},
			expansionOpportunity: {
				title: 'Expansion opportunity',
				context: 'Strong profit and cash reserves make a second storefront plausible.',
				options: {
					prepare: {
						label: 'Prepare',
						description: 'Start scouting locations and lining up the opening plan.'
					},
					pass: {
						label: 'Pass',
						description: 'Keep capital focused on the current store.'
					}
				}
			},
			supplierTerms: {
				title: 'Supplier terms',
				context:
					'A supplier is open to revising ordering terms before the next replenishment cycle.',
				options: {
					'negotiate-credit': {
						label: 'Negotiate credit',
						description: 'Stretch payment timing for a small margin penalty.'
					},
					'bulk-discount': {
						label: 'Bulk discount',
						description: 'Commit to larger orders for better unit economics.'
					}
				}
			},
			expansionUnavailable: {
				title: 'Expansion unavailable',
				context: 'This chain can operate up to {storeCap} stores for now.',
				options: {}
			},
			expansionCashBlocked: {
				title: 'Expansion delayed',
				context: 'Opening another store requires {cash} cash.',
				options: {}
			},
			locationUnavailable: {
				title: 'Location unavailable',
				blockedContext: '{reason} blocks store placement. Choose another city tile.',
				genericContext: 'Choose an unlocked, unoccupied city tile before opening this store.',
				reasons: {
					locked: 'Locked location',
					road: 'Road location',
					river: 'River location'
				},
				acknowledge: {
					description: 'Return to location planning.'
				},
				options: {}
			},
			industrialConstructionDelayed: {
				title: 'Industrial construction delayed',
				contexts: {
					unknownTile: 'Unknown industrial tile',
					unknownBuildingType: 'Unknown industrial building type',
					lockedTile: 'Locked industrial tile',
					occupiedTile: 'Occupied industrial tile',
					requiresIndustrialTile: 'Requires industrial tile',
					requiresResource: 'Requires {resource}',
					requiresCash: '{buildingName} requires {cash} cash.'
				},
				acknowledge: {
					description: 'Return to industry planning.'
				},
				options: {}
			},
			railConstruction: {
				contexts: {
					unknownBuilding: 'Unknown rail building.',
					crossCity: 'Rails cannot span different cities.',
					selfConnected: 'A rail route needs two different buildings.',
					noValidPath: 'No valid rail path to the destination.',
					alreadyConnected: 'These buildings are already connected by rail.',
					requiresCash: 'Building this rail costs {cost} but you only have {cash}.',
					segmentAtMaxLevel: 'This rail segment is already at the maximum level.',
					unknownSegment: 'Unknown rail segment.',
					tileHasRail: 'This tile already has rail on it.'
				}
			},
			worldCity: {
				cityUnavailable: {
					title: 'City unavailable',
					context: 'Unknown city.'
				},
				notAvailableYet: {
					title: 'City is not available yet',
					context: '{requirement}'
				},
				openingDelayed: {
					title: 'City opening delayed',
					context: 'Opening this city requires {cash} cash.'
				},
				acknowledge: {
					description: 'Return to the world map.'
				},
				options: {}
			},
			acknowledge: {
				label: 'Acknowledge',
				description: 'Return to operations planning.'
			}
		},
		productChainGraph: {
			title: {
				warehouseFlow: 'Warehouse flow',
				productChain: '{label} chain'
			},
			warehouseNode: 'Warehouse',
			nodeStats: {
				recipe: '{buildings} bldg · {output}/d',
				stock: 'stock {stock}'
			},
			health: {
				healthy: 'Healthy',
				watch: 'Watch',
				shortage: 'Shortage',
				'no-local-capacity': 'No local capacity',
				'no-report': 'No report yet'
			},
			emptyReason: {
				noWarehouseData: 'No warehouse stock or daily report yet.',
				noLocalChain: 'No local production chain available for this category yet.'
			},
			warnings: {
				noDailyReport: 'No daily report yet; latest-day flow is unavailable.',
				noProductionRecipe: 'No production recipe found for {materialName}.'
			},
			edges: {
				in: '{quantity}/day in',
				out: '{quantity}/day out',
				produced: '{actual}/day produced · {required}/cycle',
				used: '{actual}/day used · {required}/cycle',
				producedImported: '{actual}/day produced · {required}/cycle · import',
				usedImported: '{actual}/day used · {required}/cycle · import'
			},
			bottlenecks: {
				healthy: '{label} is flowing locally.',
				watch: '{label} stock is below latest downstream use.',
				shortage: '{label} relied on imports or had a local shortage today.',
				noLocalCapacity: '{label} has no placed local producer.',
				noReport: '{label} has no latest daily flow yet.',
				warehouseNoCapacity: 'No warehouse capacity is available.',
				warehouseOverflow: '{quantity} units are in overflow storage.',
				warehouseAvailable: 'Warehouse capacity is available.'
			}
		}
	},
	placement: {
		chooseHighlightedTile: 'Choose a highlighted tile to build.',
		retail: {
			unknownCityTile: 'Unknown city tile',
			storeLimitReached: 'Store limit reached',
			requiresCash: 'Requires {amount} cash',
			occupiedLocation: 'Occupied location',
			lockedLocation: 'Locked location',
			roadLocation: 'Road location',
			riverLocation: 'River location',
			noValidTiles: 'No valid tiles'
		},
		industry: {
			lockedUntilRetail: 'Open a retail store to unlock construction.',
			unknownBuildingType: 'Unknown industrial building type',
			requiresCash: '{buildingName} requires {amount} cash.'
		}
	}
} as const;
