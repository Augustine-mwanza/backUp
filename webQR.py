import qrcode
scan = qrcode.make("https://augustine-mwanza.github.io/backUp/")
scan.save("webQR.png")