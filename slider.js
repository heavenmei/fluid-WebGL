"use strict";

class Slider {
    constructor(element, initial, min, max, changeCallback) {
        this.value = initial;
        this.min = min;
        this.max = max;
        this.div = element;

        this.innerDiv = document.createElement("div");
        this.innerDiv.style.position = "absolute";
        this.innerDiv.style.height = this.div.offsetHeight + "px";

        this.div.appendChild(this.innerDiv);

        this.changeCallback = changeCallback;
        this.mousePressed = false;

        this.redraw();

        this.div.addEventListener("mousedown", (event) => {
            this.mousePressed = true;
            this.onChange(event);
        });

        document.addEventListener("mouseup", () => {
            this.mousePressed = false;
        });

        document.addEventListener("mousemove", (event) => {
            if (this.mousePressed) {
                this.onChange(event);
            }
        });
    }

    redraw() {
        const fraction = (this.value - this.min) / (this.max - this.min);
        this.innerDiv.style.width = fraction * this.div.offsetWidth + "px";
        this.innerDiv.style.height = this.div.offsetHeight + "px";
    }

    onChange(event) {
        const mouseX = Utilities.getMousePosition(event, this.div).x;
        this.value = Utilities.clamp(
            (mouseX / this.div.offsetWidth) * (this.max - this.min) + this.min,
            this.min,
            this.max
        );

        this.redraw();
        this.changeCallback(this.value);
    }
}
