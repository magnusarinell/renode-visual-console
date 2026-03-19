// Constants for the Daisy Seed simulation scenario.
// yd_stm32h750vb board pin mapping:
//   led0  → PA15 (yellow LED, GPIO_ACTIVE_HIGH)  — our toggle output
//   sw0   → PB3  (user button, GPIO_ACTIVE_LOW | GPIO_PULL_UP)
//   uart  → USART1 (PA9 TX, PA10 RX, 115200 baud)
// Hardware onboard LED (libDaisy Blink example):
//   led   → PC7  (red LED, GPIO_ACTIVE_HIGH)

export const DAISY_MACHINE    = "daisy_0";
export const DAISY_OUTPUT_PIN = "PA15";   // toggled by firmware on each button press
export const DAISY_INPUT_PIN  = "PB3";    // user button (physical LOW = pressed)
export const DAISY_LED_PIN    = "PC7";    // onboard red LED (Blink example)

export const DAISY_PIN_LEGEND = [
	{ tone: "analog-audio", label: "Analog Audio" },
	{ tone: "analog-gpio", label: "Analog GPIO" },
	{ tone: "digital-audio-gpio", label: "Digital Audio GPIO" },
	{ tone: "peripheral-gpio", label: "Peripheral GPIO" },
	{ tone: "usb-gpio", label: "USB GPIO" },
	{ tone: "ground", label: "Ground" },
	{ tone: "power", label: "Power" },
	{ tone: "daisy-pin", label: "Daisy Pin Names*" },
];

export const DAISY_PINOUT_LEFT = [
	{ number: 21, pinLabel: "3V3", badges: [{ label: "3V3 Analog", tone: "power" }] },
	{ number: 22, pinLabel: "A0 / D15", badges: [{ label: "ADC 0", tone: "analog-gpio" }] },
	{ number: 23, pinLabel: "A1 / D16", badges: [{ label: "ADC 1", tone: "analog-gpio" }] },
	{ number: 24, pinLabel: "A2 / D17", badges: [{ label: "ADC 2", tone: "analog-gpio" }] },
	{ number: 25, pinLabel: "A3 / D18", badges: [{ label: "ADC 3", tone: "analog-gpio" }] },
	{ number: 26, pinLabel: "A4 / D19", badges: [{ label: "ADC 4", tone: "analog-gpio" }] },
	{ number: 27, pinLabel: "A5 / D20", badges: [{ label: "ADC 5", tone: "analog-gpio" }] },
	{ number: 28, pinLabel: "A6 / D21", badges: [{ label: "ADC 6", tone: "analog-gpio" }] },
	{
		number: 29,
		pinLabel: "A7 / D22",
		badges: [
			{ label: "ADC 7", tone: "analog-gpio" },
			{ label: "DAC OUT 2", tone: "analog-audio" },
		],
	},
	{
		number: 30,
		pinLabel: "A8 / D23",
		badges: [
			{ label: "ADC 8", tone: "analog-gpio" },
			{ label: "DAC OUT 1", tone: "analog-audio" },
		],
	},
	{
		number: 31,
		pinLabel: "A9 / D24",
		badges: [
			{ label: "ADC 9", tone: "analog-gpio" },
			{ label: "SAI2 MCLK", tone: "digital-audio-gpio" },
		],
	},
	{
		number: 32,
		pinLabel: "A10 / D25",
		badges: [
			{ label: "ADC 10", tone: "analog-gpio" },
			{ label: "SAI2 SD B", tone: "digital-audio-gpio" },
		],
	},
	{ number: 33, pinLabel: "D26", badges: [{ label: "SAI2 SD A", tone: "digital-audio-gpio" }] },
	{ number: 34, pinLabel: "D27", badges: [{ label: "SAI2 FS", tone: "digital-audio-gpio" }] },
	{
		number: 35,
		pinLabel: "A11 / D28",
		badges: [
			{ label: "ADC 11", tone: "analog-gpio" },
			{ label: "SAI2 SCK", tone: "digital-audio-gpio" },
		],
	},
	{
		number: 36,
		pinLabel: "D29",
		badges: [
			{ label: "USART1 Tx", tone: "peripheral-gpio" },
			{ label: "USB D-", tone: "usb-gpio" },
		],
	},
	{
		number: 37,
		pinLabel: "D30",
		badges: [
			{ label: "USART1 Rx", tone: "peripheral-gpio" },
			{ label: "USB D+", tone: "usb-gpio" },
		],
	},
	{ number: 38, pinLabel: "3V3", badges: [{ label: "3V3 Digital", tone: "power" }] },
	{ number: 39, pinLabel: "VIN", badges: [{ label: "VIN", tone: "power" }] },
	{ number: 40, pinLabel: "DGND", badges: [{ label: "DGND", tone: "ground" }] },
];

export const DAISY_PINOUT_RIGHT = [
	{ number: 20, pinLabel: "AGND", badges: [{ label: "AGND", tone: "ground" }] },
	{ number: 19, pinLabel: "out[1]", badges: [{ label: "Audio Out 2", tone: "analog-audio" }] },
	{ number: 18, pinLabel: "out[0]", badges: [{ label: "Audio Out 1", tone: "analog-audio" }] },
	{ number: 17, pinLabel: "in[1]", badges: [{ label: "Audio In 2", tone: "analog-audio" }] },
	{ number: 16, pinLabel: "in[0]", badges: [{ label: "Audio In 1", tone: "analog-audio" }] },
	{
		number: 15,
		pinLabel: "D14",
		badges: [
			{ label: "USART1 Rx", tone: "peripheral-gpio" },
			{ label: "I2C4 SDA", tone: "peripheral-gpio" },
		],
	},
	{
		number: 14,
		pinLabel: "D13",
		badges: [
			{ label: "USART1 Tx", tone: "peripheral-gpio" },
			{ label: "I2C4 SCL", tone: "peripheral-gpio" },
		],
	},
	{
		number: 13,
		pinLabel: "D12",
		badges: [
			{ label: "I2C1 SDA", tone: "peripheral-gpio" },
			{ label: "UART4 Tx", tone: "peripheral-gpio" },
		],
	},
	{
		number: 12,
		pinLabel: "D11",
		badges: [
			{ label: "I2C1 SCL", tone: "peripheral-gpio" },
			{ label: "UART4 Rx", tone: "peripheral-gpio" },
		],
	},
	{ number: 11, pinLabel: "D10", badges: [{ label: "SPI1 MOSI", tone: "peripheral-gpio" }] },
	{ number: 10, pinLabel: "D9", badges: [{ label: "SPI1 MISO", tone: "peripheral-gpio" }] },
	{
		number: 9,
		pinLabel: "D8",
		badges: [
			{ label: "SPI1 SCK", tone: "peripheral-gpio" },
			{ label: "SPDIFRX1", tone: "peripheral-gpio" },
		],
	},
	{ number: 8, pinLabel: "D7", badges: [{ label: "SPI1 CS", tone: "peripheral-gpio" }] },
	{
		number: 7,
		pinLabel: "D6",
		badges: [
			{ label: "SD CLK", tone: "peripheral-gpio" },
			{ label: "USART5 Tx", tone: "peripheral-gpio" },
		],
	},
	{
		number: 6,
		pinLabel: "D5",
		badges: [
			{ label: "SD CMD", tone: "peripheral-gpio" },
			{ label: "USART5 Rx", tone: "peripheral-gpio" },
		],
	},
	{ number: 5, pinLabel: "D4", badges: [{ label: "SD Data 0", tone: "peripheral-gpio" }] },
	{ number: 4, pinLabel: "D3", badges: [{ label: "SD Data 1", tone: "peripheral-gpio" }] },
	{
		number: 3,
		pinLabel: "D2",
		badges: [
			{ label: "SD Data 2", tone: "peripheral-gpio" },
			{ label: "USART3 Tx", tone: "peripheral-gpio" },
		],
	},
	{
		number: 2,
		pinLabel: "D1",
		badges: [
			{ label: "SD Data 3", tone: "peripheral-gpio" },
			{ label: "USART3 Rx", tone: "peripheral-gpio" },
		],
	},
	{ number: 1, pinLabel: "D0", badges: [{ label: "USB ID", tone: "usb-gpio" }] },
];

export const DAISY_SIGNAL_CARDS = [
	{
		stmPin: DAISY_INPUT_PIN,
		label: "USER Button",
		alias: "sw0",
		role: "input",
		accent: "button",
		description: "Active-low user input used to trigger the firmware toggle.",
	},
	{
		stmPin: DAISY_OUTPUT_PIN,
		label: "Toggle Output",
		alias: "led0",
		role: "output",
		accent: "output",
		description: "Firmware-driven PA15 output that flips on each button press.",
	},
	{
		stmPin: DAISY_LED_PIN,
		label: "Onboard LED",
		alias: "led",
		role: "output",
		accent: "led",
		description: "PC7 activity LED from the Daisy Blink example.",
	},
];
