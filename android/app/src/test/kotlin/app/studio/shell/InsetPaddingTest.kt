package app.studio.shell

import org.junit.Assert.assertArrayEquals
import org.junit.Test

class InsetPaddingTest {
    @Test fun fullScreenContainerGetsAllInsets() {
        assertArrayEquals(intArrayOf(0, 100, 0, 60),
            InsetPadding.compute(0, 100, 0, 60, 0, 0, 1080, 2400, 1080, 2400))
    }

    @Test fun topAlreadyCoveredByActionBarIsNotCountedTwice() {
        assertArrayEquals(intArrayOf(0, 0, 0, 60),
            InsetPadding.compute(0, 100, 0, 60, 0, 168, 1080, 2232, 1080, 2400))
    }

    @Test fun partialOverlapOnlyAddsMissingPart() {
        assertArrayEquals(intArrayOf(0, 30, 0, 0),
            InsetPadding.compute(0, 100, 0, 0, 0, 70, 1080, 2000, 1080, 2400))
    }

    @Test fun imeLargerThanNavigationBar() {
        assertArrayEquals(intArrayOf(0, 0, 0, 900),
            InsetPadding.compute(0, 0, 0, 900, 0, 0, 1080, 2400, 1080, 2400))
    }
}
