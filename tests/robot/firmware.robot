*** Settings ***
Library           ${RENODEKEYWORDS}
Test Teardown     Test Teardown

*** Variables ***
${SCRIPT}         ${CURDIR}/../../zephyr/renode/discovery_dual.resc
${BOOT_TIMEOUT}   15

*** Keywords ***
Load And Start Boards
    Execute Script    ${SCRIPT}

Boot Board
    [Arguments]    ${machine}
    ${tester}=    Create Terminal Tester    sysbus.usart3    machine=${machine}    timeout=${BOOT_TIMEOUT}
    Wait For Line On Uart    Application ready    testerId=${tester}
    [Return]    ${tester}

Press Button On Board 0
    Execute Command    mach set "board_0"
    Execute Command    sysbus.gpioPortA.UserButton Press
    Sleep    1
    Execute Command    sysbus.gpioPortA.UserButton Release
    Sleep    1

*** Test Cases ***

Boot - Board 0 Starts Successfully
    [Documentation]    board_0 firmware boots and prints "Application ready" on usart3.
    [Tags]    boot
    Load And Start Boards
    Boot Board    board_0

Boot - Board 1 Starts Successfully
    [Documentation]    board_1 firmware boots and prints "Application ready" on usart3.
    [Tags]    boot
    Load And Start Boards
    Boot Board    board_1

Mode - First Button Press Activates Chase LED
    [Documentation]    One press on the user button cycles mode from Blink to Chase.
    ...                PB12 (Blink) goes off; PB13 (Chase) lights up.
    [Tags]    gpio    mode
    Load And Start Boards
    Boot Board    board_0
    ${blink_led}=         Create LED Tester    sysbus.gpioPortB.modeBlinkLED    machine=board_0    defaultTimeout=2
    ${chase_led}=         Create LED Tester    sysbus.gpioPortB.modeChaseLED   machine=board_0    defaultTimeout=2
    Press Button On Board 0
    Assert LED State      false    testerId=${blink_led}
    Assert LED State      true     testerId=${chase_led}

Mode - Second Button Press Activates Showcase LED
    [Documentation]    Two presses cycle mode to Showcase. PB14 lights up.
    [Tags]    gpio    mode
    Load And Start Boards
    Boot Board    board_0
    ${showcase_led}=      Create LED Tester    sysbus.gpioPortB.modeShowcaseLED    machine=board_0    defaultTimeout=2
    Press Button On Board 0
    Press Button On Board 0
    Assert LED State      true    testerId=${showcase_led}

Mode - Third Button Press Wraps Back To Blink LED
    [Documentation]    Three presses wrap mode back to Blink. PB12 lights up again.
    [Tags]    gpio    mode
    Load And Start Boards
    Boot Board    board_0
    ${blink_led}=         Create LED Tester    sysbus.gpioPortB.modeBlinkLED    machine=board_0    defaultTimeout=2
    Press Button On Board 0
    Press Button On Board 0
    Press Button On Board 0
    Assert LED State      true    testerId=${blink_led}

UART - TOGGLE_1 From Board 1 Drives LED0 High On Board 0
    [Documentation]    board_1 sends TOGGLE_1 via the inter-board UART Hub.
    ...                board_0 drives UserLED (PD12) high.
    [Tags]    uart    gpio
    Load And Start Boards
    Boot Board    board_0
    Boot Board    board_1
    ${uart_tester}=    Create Terminal Tester    sysbus.usart2    machine=board_1    timeout=${BOOT_TIMEOUT}
    ${led_tester}=     Create LED Tester         sysbus.gpioPortD.UserLED    machine=board_0    defaultTimeout=2
    Write Line To Uart    TOGGLE_1    testerId=${uart_tester}
    Sleep    2
    Assert LED State      true    testerId=${led_tester}

UART - Second TOGGLE_1 From Board 1 Drives LED0 Low On Board 0
    [Documentation]    A second TOGGLE_1 from board_1 toggles UserLED back off.
    [Tags]    uart    gpio
    Load And Start Boards
    Boot Board    board_0
    Boot Board    board_1
    ${uart_tester}=    Create Terminal Tester    sysbus.usart2    machine=board_1    timeout=${BOOT_TIMEOUT}
    ${led_tester}=     Create LED Tester         sysbus.gpioPortD.UserLED    machine=board_0    defaultTimeout=2
    Write Line To Uart    TOGGLE_1    testerId=${uart_tester}
    Sleep    2
    Write Line To Uart    TOGGLE_1    testerId=${uart_tester}
    Sleep    2
    Assert LED State      false    testerId=${led_tester}
