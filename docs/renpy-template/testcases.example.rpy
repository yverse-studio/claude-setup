testcase default:
    "Start"
    pause 1.0
    pause 1.0
    click
    pause 1.0
    type "Ren"
    type RETURN
    click until "Zieh dein Jackett"
    click until "„Ich lach nicht"
    click until "„Zweimal die Woche"
    click until label ende
    $ renpy.take_screenshot()
    click until "Rika ♥"
    pause 1.0
    $ renpy.screenshot("/tmp/rp/shot_end.png")
    $ renpy.quit()
