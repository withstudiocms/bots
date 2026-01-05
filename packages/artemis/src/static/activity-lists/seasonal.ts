export type SeasonalActivity = {
	timeframe: { start: { month: number; day: number }; end: { month: number; day: number } };
	activities: string[];
};

export const seasonalActivities: SeasonalActivity[] = [
	// January
	{
		timeframe: { start: { month: 1, day: 1 }, end: { month: 1, day: 7 } },
		activities: [
			'New Year, new code... 🎉',
			'Setting resolutions... 📝',
			'Making fresh starts... ✨',
			`Writing ${new Date().getFullYear()} goals... 🎯`,
			'Reflecting on last year... 💭',
			'Planning improvements... 🚀',
		],
	},
	{
		timeframe: { start: { month: 1, day: 15 }, end: { month: 1, day: 21 } },
		activities: [
			'Honoring MLK Day... ✊',
			'Reflecting on civil rights... 📚',
			'Spreading equality... 🤝',
			'Remembering history... 🗽',
			'Volunteering in the community... 💪',
		],
	},

	// February
	{
		timeframe: { start: { month: 2, day: 1 }, end: { month: 2, day: 9 } },
		activities: [
			'Celebrating Black History Month... 📚',
			'Learning about Black excellence... ✊🏿',
			'Watching for Groundhog shadows... 🦫',
			'Enjoying winter sports... ⛷️',
			'Staying cozy indoors... ☕',
			'Building snowmen... ⛄',
		],
	},
	{
		timeframe: { start: { month: 2, day: 10 }, end: { month: 2, day: 20 } },
		activities: [
			"Valentine's Day preparations... 💖",
			'Making heart-shaped cookies... 🍪',
			'Writing love letters... 💌',
			'Buying chocolates... 🍫',
			'Planning romantic dates... 🌹',
			'Crafting Valentine cards... 💝',
			'Spreading the love... 💕',
		],
	},

	// March
	{
		timeframe: { start: { month: 3, day: 1 }, end: { month: 3, day: 16 } },
		activities: [
			"Celebrating Women's History Month... 👩",
			'Planning spring cleaning... 🌸',
			'Prepping the garden... 🌱',
			'Watching for spring blooms... 🌷',
			'Opening windows for fresh air... 🪟',
			'Organizing closets... 🧹',
			'Power washing the deck... 💦',
		],
	},
	{
		timeframe: { start: { month: 3, day: 17 }, end: { month: 3, day: 17 } },
		activities: [
			"Celebrating St. Patrick's Day... 🍀",
			'Searching for four-leaf clovers... 🌿',
			'Wearing green... 💚',
			'Cooking corned beef... 🥩',
			'Watching parades... 🎉',
			'Drinking Irish coffee... ☕',
			'Listening to Irish music... 🎵',
		],
	},
	{
		timeframe: { start: { month: 3, day: 18 }, end: { month: 3, day: 31 } },
		activities: [
			'Welcoming spring... 🌷',
			'Planting flowers... 🌺',
			'Enjoying longer days... ☀️',
			'Taking nature walks... 🚶',
			'Bird watching... 🐦',
			'Flying kites... 🪁',
		],
	},

	// April
	{
		timeframe: { start: { month: 4, day: 1 }, end: { month: 4, day: 1 } },
		activities: [
			'Playing April Fools pranks... 🤡',
			'Testing whoopee cushions... 🎈',
			'Fooling friends... 😜',
			'Setting up harmless traps... 🎭',
			'Laughing at jokes... 😂',
			'Being silly... 🤪',
			'Pranking coworkers... 🎪',
		],
	},
	{
		timeframe: { start: { month: 4, day: 2 }, end: { month: 4, day: 21 } },
		activities: [
			'Enjoying spring showers... 🌧️',
			'Picking spring flowers... 🌼',
			'Cleaning out the garage... 🧽',
			'Watching flowers bloom... 🌻',
			'Planting vegetable gardens... 🥕',
			'Opening pool season... 🏊',
		],
	},
	{
		timeframe: { start: { month: 4, day: 22 }, end: { month: 4, day: 30 } },
		activities: [
			'Celebrating Earth Day... 🌍',
			'Planting trees... 🌳',
			'Recycling... ♻️',
			'Going green... 🌿',
			'Cleaning up parks... 🗑️',
			'Reducing carbon footprint... 👣',
			'Composting... 🍂',
		],
	},

	// May
	{
		timeframe: { start: { month: 5, day: 1 }, end: { month: 5, day: 7 } },
		activities: [
			'Celebrating May Day... 🌺',
			'Preparing for Cinco de Mayo... 🇲🇽',
			'Making tacos... 🌮',
			'Dancing to mariachi... 🎺',
			'Enjoying margaritas... 🍹',
			'Celebrating Mexican heritage... 🎊',
		],
	},
	{
		timeframe: { start: { month: 5, day: 8 }, end: { month: 5, day: 14 } },
		activities: [
			"Shopping for Mother's Day... 💐",
			'Making breakfast in bed... 🥞',
			'Buying flowers for mom... 🌹',
			'Crafting homemade cards... 🎨',
			'Calling mom... 📱',
			'Taking mom to brunch... 🥂',
			'Showing appreciation... 💕',
		],
	},
	{
		timeframe: { start: { month: 5, day: 15 }, end: { month: 5, day: 31 } },
		activities: [
			'Honoring Memorial Day... 🇺🇸',
			'Having BBQ cookouts... 🍔',
			'Going camping... ⛺',
			'Starting summer plans... 🏖️',
			'Visiting memorials... 🎖️',
			'Watching parades... 🎺',
			'Grilling hot dogs... 🌭',
		],
	},

	// June
	{
		timeframe: { start: { month: 6, day: 1 }, end: { month: 6, day: 13 } },
		activities: [
			'Celebrating Pride Month... 🏳️‍🌈',
			'Attending pride parades... 🎉',
			'Supporting LGBTQ+ rights... 💜',
			'Wearing rainbows... 🌈',
			'Spreading love and acceptance... 💖',
			'Celebrating diversity... 🎊',
		],
	},
	{
		timeframe: { start: { month: 6, day: 14 }, end: { month: 6, day: 20 } },
		activities: [
			"Planning Father's Day... 👔",
			'Grilling with dad... 🥩',
			'Buying power tools... 🔧',
			'Going fishing... 🎣',
			'Playing catch... ⚾',
			'Watching sports with dad... 🏈',
			'Making dad jokes... 😄',
		],
	},
	{
		timeframe: { start: { month: 6, day: 19 }, end: { month: 6, day: 19 } },
		activities: [
			'Celebrating Juneteenth... ✊🏿',
			'Learning freedom history... 📚',
			'Attending community events... 🎉',
			'Supporting Black businesses... 🏪',
			'Reflecting on liberation... 🗽',
		],
	},
	{
		timeframe: { start: { month: 6, day: 21 }, end: { month: 6, day: 30 } },
		activities: [
			'Enjoying the summer solstice... ☀️',
			'Having beach days... 🏖️',
			'Swimming in pools... 🏊',
			'Eating ice cream... 🍦',
			'Staying up late... 🌅',
			'Going on road trips... 🚗',
		],
	},

	// July
	{
		timeframe: { start: { month: 7, day: 1 }, end: { month: 7, day: 7 } },
		activities: [
			'Celebrating Independence Day... 🇺🇸',
			'Watching fireworks... 🎆',
			'Grilling burgers... 🍔',
			'Having picnics... 🧺',
			'Waving flags... 🎌',
			'Eating watermelon... 🍉',
			'Playing lawn games... 🎯',
			'Hosting BBQ parties... 🎊',
		],
	},
	{
		timeframe: { start: { month: 7, day: 8 }, end: { month: 7, day: 31 } },
		activities: [
			'Going to the beach... 🏖️',
			'Building sandcastles... 🏰',
			'Surfing waves... 🏄',
			'Having bonfires... 🔥',
			'Stargazing... ✨',
			'Catching fireflies... 🐛',
			'Drinking lemonade... 🍋',
		],
	},

	// August
	{
		timeframe: { start: { month: 8, day: 1 }, end: { month: 8, day: 19 } },
		activities: [
			'Enjoying summer vibes... ☀️',
			'Having barbecues... 🌭',
			'Going to state fairs... 🎡',
			'Eating funnel cakes... 🎂',
			'Riding roller coasters... 🎢',
			'Watching meteor showers... 🌠',
			'Camping under stars... ⛺',
		],
	},
	{
		timeframe: { start: { month: 8, day: 20 }, end: { month: 8, day: 31 } },
		activities: [
			'Back to school shopping... 📚',
			'Buying new backpacks... 🎒',
			'Sharpening pencils... ✏️',
			'Getting ready for classes... 📖',
			'Meeting new teachers... 👨‍🏫',
			'Organizing binders... 📋',
			'Setting up dorm rooms... 🛏️',
		],
	},

	// September
	{
		timeframe: { start: { month: 9, day: 1 }, end: { month: 9, day: 7 } },
		activities: [
			'Celebrating Labor Day... 🛠️',
			'Having end-of-summer parties... 🎉',
			'Taking one last beach trip... 🌊',
			'Grilling one more time... 🍗',
			'Relaxing before fall... 😌',
			'Closing the pool... 🏊',
		],
	},
	{
		timeframe: { start: { month: 9, day: 8 }, end: { month: 9, day: 21 } },
		activities: [
			'Getting ready for back to school... 🎒',
			'Joining fall sports... ⚽',
			'Attending football games... 🏈',
			'Tailgating... 🚙',
			'Cheering for teams... 📣',
			'Enjoying cooler weather... 🍃',
		],
	},
	{
		timeframe: { start: { month: 9, day: 22 }, end: { month: 9, day: 30 } },
		activities: [
			'Welcoming autumn... 🍂',
			'Watching leaves change... 🍁',
			'Drinking pumpkin spice... ☕',
			'Wearing cozy sweaters... 🧥',
			'Going apple picking... 🍎',
			'Making apple cider... 🍺',
			'Decorating for fall... 🎃',
		],
	},

	// October
	{
		timeframe: { start: { month: 10, day: 1 }, end: { month: 10, day: 15 } },
		activities: [
			'Visiting pumpkin patches... 🎃',
			'Going on hayrides... 🚜',
			'Walking through corn mazes... 🌽',
			'Picking apples... 🍏',
			'Making caramel apples... 🍎',
			'Enjoying fall festivals... 🎪',
			'Raking leaf piles... 🍂',
		],
	},
	{
		timeframe: { start: { month: 10, day: 16 }, end: { month: 10, day: 24 } },
		activities: [
			'Planning Halloween costumes... 👻',
			'Decorating with skeletons... 💀',
			'Hanging fake cobwebs... 🕸️',
			'Buying candy... 🍬',
			'Testing costume ideas... 🎭',
			'Making spooky playlists... 🎵',
		],
	},
	{
		timeframe: { start: { month: 10, day: 25 }, end: { month: 11, day: 2 } },
		activities: [
			'Carving pumpkins... 🎃',
			'Going trick-or-treating... 🍬',
			'Watching scary movies... 👹',
			'Telling ghost stories... 👻',
			'Handing out candy... 🍫',
			'Attending costume parties... 🎉',
			'Bobbing for apples... 🍎',
			'Visiting haunted houses... 🏚️',
		],
	},

	// November
	{
		timeframe: { start: { month: 11, day: 3 }, end: { month: 11, day: 10 } },
		activities: [
			'Raking autumn leaves... 🍁',
			'Jumping in leaf piles... 🍂',
			'Preparing for winter... ❄️',
			'Storing patio furniture... 🪑',
			'Cleaning gutters... 🏠',
			'Splitting firewood... 🪓',
		],
	},
	{
		timeframe: { start: { month: 11, day: 11 }, end: { month: 11, day: 11 } },
		activities: [
			'Honoring Veterans Day... 🎖️',
			'Thanking veterans... 🇺🇸',
			'Visiting memorials... 🗽',
			'Attending ceremonies... 🎺',
			'Showing gratitude... 💙',
			'Flying flags... 🎌',
		],
	},
	{
		timeframe: { start: { month: 11, day: 12 }, end: { month: 11, day: 30 } },
		activities: [
			'Preparing for Thanksgiving... 🦃',
			'Baking pies... 🥧',
			'Setting the dinner table... 🍽️',
			'Making cranberry sauce... 🍒',
			'Stuffing the turkey... 🍗',
			'Mashing potatoes... 🥔',
			'Watching football... 🏈',
			'Expressing gratitude... 🙏',
			'Black Friday shopping... 🛍️',
		],
	},

	// December
	{
		timeframe: { start: { month: 12, day: 1 }, end: { month: 12, day: 9 } },
		activities: [
			'Decorating for the holidays... 🎄',
			'Hanging lights... 💡',
			'Stringing popcorn garland... 🍿',
			'Setting up the tree... 🌲',
			'Hanging ornaments... 🎀',
			'Playing holiday music... 🎵',
			'Making hot cocoa... ☕',
		],
	},
	{
		timeframe: { start: { month: 12, day: 10 }, end: { month: 12, day: 19 } },
		activities: [
			'Baking holiday cookies... 🍪',
			'Singing carols... 🎵',
			'Building gingerbread houses... 🏠',
			'Making candy canes... 🍬',
			'Writing wish lists... 📝',
			'Mailing holiday cards... 📬',
			'Shopping for gifts... 🎁',
		],
	},
	{
		timeframe: { start: { month: 12, day: 20 }, end: { month: 12, day: 26 } },
		activities: [
			'Wrapping presents... 🎁',
			'Celebrating Christmas... 🎅',
			'Celebrating Hanukkah... 🕎',
			'Lighting menorahs... 🕯️',
			'Drinking eggnog... 🥛',
			'Visiting Santa... 🎅',
			'Opening stockings... 🧦',
			'Having family dinners... 🍽️',
			'Watching holiday movies... 📺',
		],
	},
	{
		timeframe: { start: { month: 12, day: 26 }, end: { month: 12, day: 31 } },
		activities: [
			'Celebrating Kwanzaa... 🕯️',
			'Counting down to New Year... 🎊',
			'Planning NYE parties... 🎉',
			'Making resolutions... 📋',
			'Reflecting on the year... 💭',
			'Watching year-in-review... 📺',
			'Preparing for midnight... ⏰',
		],
	},
];
