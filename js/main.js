// let _DEV = "?dev_remote=true";
// let _DEV = "?dev_iphone=true";

// Global variables for Pagination (Desktop only)
// The current page we're one
let CURRENT_PAGE = null;
// All pages as a json 
let PAGES = null;
// The currently selected pagination element (div)
let SELECTED_PAGINATION_DIV = null;

// Global variable containing all Headlines
let ALL_HEADLINES = [];

let SHAPEFILE_CACHE = {};

// The map
let MAP;
let SWIPE;

// The available news sources
let NEWS_SOURCES = {
    "bbc": {
        "name": "BBC",
        "selected": true
    },
    "nyt": {
        "name": "The New York Times",
        "selected": true
    },
    "tg": {
        "name": "The Guardian",
        "selected": true
    },
    "r": {
        "name": "Reuters",
        "selected": true
    },
    "lat": {
        "name": "Los Angeles Times",
        "selected": true
    },
}

let SANE_COUNTRY_NAMES = {
    "Us": "United States of America",
    "U.S.": "United States of America",
    "U.s.": "United States of America",
    "The United States of America": "United States of America",
    "The United States": "United States of America",
    "Uk": "United Kingdom"
}

// Error messages 
const MOBILE_NOTHING_FOUND = "Swipe up from here to adjust your filters.";
const DESKTOP_NOTHING_FOUND = "Please adjust your filters and search.";

// Whether we're on mobile
let IS_MOBILE;
let CAROUSEL;

let FILTER_TIMEOUT;

// --------------------------------------------------------------------------------------------------
// Initializers
// --------------------------------------------------------------------------------------------------

// Initialize everything ;)
let init = async (is_mobile) => {
    IS_MOBILE = is_mobile;

    // Check whether we should show the explanatory overlay
    if (IS_MOBILE) {
        if (localStorage.getItem('has_visited_previously')) {
            document.getElementById("explanation-overlay").classList.add("hide");
        } else {
            localStorage.setItem('has_visited_previously', "true");
            document.getElementById("explanation-close").onclick = () => {
                document.getElementById("explanation-overlay").classList.add("hide");
            }
        }
    }


    let news_source_preferences = localStorage.getItem('preferences_news_sources');
    try {
        news_source_preferences = JSON.parse(news_source_preferences);
    } catch {
        news_source_preferences = null;
    }
    // If there are stored news source preferences AND if they haven't been updated
    if (news_source_preferences && Object.keys(news_source_preferences).toString() === Object.keys(NEWS_SOURCES).toString()) {
        NEWS_SOURCES = news_source_preferences;
    }

    // Check previously stored news sources preferences
    for (let source of Object.keys(NEWS_SOURCES)) {
        if (localStorage.getItem('sources'))
            console.log(NEWS_SOURCES[source]);
    }

    // Adjust selection of news sources
    for (let source of Object.keys(NEWS_SOURCES)) {
        if (NEWS_SOURCES[source]["selected"])
            document.getElementById("dropdown_" + source).classList.add("selected");
    }

    MAP = initialize_map();

    // Fetch all headlines
    let all_headlines = await get_headlines();
    for (let raw_headline of all_headlines) {
        ALL_HEADLINES.push(new Headline(raw_headline))
    }
    ALL_HEADLINES = ALL_HEADLINES.sort(function(a, b) { return b.published_dt - a.published_dt });
    // ALL_HEADLINES = ALL_HEADLINES.slice(1, 10);


    update_shown_headlines();

    // let headlines = document.querySelectorAll(".headline");
    // for(let headline of headlines) {
    //     let startX = 0;
    //     headline.ontouchstart = (event) => {
    //         headline.classList.remove("smooth")
    //         start_x = event.touches[0].clientX;
    //     }
    //     headline.ontouchmove = (event) => {
    //         let delta = event.touches[0].clientX - start_x;
    //         headline.style.transform = `translateX(${delta}px)`
    //     }
    //     headline.ontouchend = (event) => {
    //         let delta = event.changedTouches[0].clientX - start_x;
    //         if(Math.abs(delta) > screen.width*0.5) {
    //             headline.classList.add("smooth")
    //             headline.style.transform = `translateX(${delta / Math.abs(delta) * screen.width}px)`
    //         }else {
    //             headline.style.transform = `translateX(0px)`
    //         }
    //     }
    // }

}

// Show about window
let show_about = () => {
    document.getElementById("about").classList.remove("hide");
}
// Close about window
let close_about = () => {
    document.getElementById("about").classList.add("hide");
}

let reinitialize_carousel = () => {

    console.log("re-initialize")

    let showing_headline;
    let scroll_adjusted = false;

    let headlines_container = document.querySelector('#headlines_container_divs');
    let element = document.getElementById('slider');

    // if (SWIPE)
    //     SWIPE.kill();

    SWIPE = new Swipe(element, {
        startSlide: 0,
        auto: 0,
        draggable: false,
        autoRestart: false,
        continuous: false,
        disableScroll: true,
        stopPropagation: true,
        callback: function(index, element) {
            // Slide changed
            // showing_headline = ALL_HEADLINES.filter(h => h.is_show)[index];
            // headlines_container.style.maxHeight = showing_headline.div_card.offsetHeight + 10 + "px";

            // setTimeout(() => {
            //     showing_headline.show_markers(true);
            // }, 50);

            // scroll_adjusted = false;
        },
        transitionEnd: function(index, element) {
            // Transition ended, but slide not necessarily changed
            // scroll_adjusted = false;
            // headlines_container.style.maxHeight = showing_headline.div_card.offsetHeight + 10 + "px";
        }
    });

    // element.ontouchmove = () => {
    //     if (!scroll_adjusted) {
    //         headlines_container.style.maxHeight = "80vh";
    //         scroll_adjusted = true;
    //     }
    // }
}

let initialize_carousel = () => {
    reinitialize_carousel();
}

// Initialize the map
// @return  {map}                           The mapkit map 
let initialize_map = () => {

    // Initialize with authorization callback on Cloudflare worker
    mapkit.init({
        authorizationCallback: function(done) {
            fetch("https://mapnews-mapkey.menzinger.workers.dev" + _DEV)
                .then(response => response.json())
                .then(result => {
                    done(result.token)
                })
        }
    });

    // 
    map = new mapkit.Map("map");

    // Important: allows zooming in with the scrollwheel!
    map._allowWheelToZoom = true;
    return map
}

// --------------------------------------------------------------------------------------------------
// Actions toggled via HTML
// --------------------------------------------------------------------------------------------------

// The on-input listener for the searchbar
// @param   {dom element}   search_div      The searchbar dom element triggering the event
let search = (search_div) => {
    const search_string = document.getElementById("search").value
    if (IS_MOBILE) {

        // Clear the timeout if there was one
        if (FILTER_TIMEOUT)
            clearTimeout(FILTER_TIMEOUT);

        // Wait 1 second before refreshing
        FILTER_TIMEOUT = setTimeout(function() {
            apply_filters(search_string);
            update_shown_headlines();
        }, 1000);
    } else {
        apply_filters(search_string);
        update_shown_headlines();
    }
}

// Toggle the provider upon button click
// Re-applies all filters (previous search etc.) 
// Re-draws all headlines
let toggle_provider = (clicked_dropdown) => {
    selected_source = clicked_dropdown.id.replace("dropdown_", "");
    clicked_dropdown.classList.toggle("selected");
    console.log(selected_source);
    NEWS_SOURCES[selected_source].selected = !NEWS_SOURCES[selected_source].selected;

    // Save in localstorage
    localStorage.setItem('preferences_news_sources', JSON.stringify(NEWS_SOURCES))

    const search_string = document.getElementById("search").value
    if (IS_MOBILE) {

        // Clear the timeout if there was one
        if (FILTER_TIMEOUT)
            clearTimeout(FILTER_TIMEOUT);

        // Wait 1 second before refreshing
        FILTER_TIMEOUT = setTimeout(function() {
            apply_filters(search_string);
            update_shown_headlines();
        }, 1000);

    } else {
        // On desktop update immediately
        apply_filters(search_string);
        update_shown_headlines();
    }
}

// --------------------------------------------------------------------------------------------------
// General functions
// --------------------------------------------------------------------------------------------------

// Updates the shown headlines
// If there are none to be shown, show a courtesy notice explaining that.
// Clears all previously shown items, adds any that are to be shown
// Splits the headlines to pages if IS_MOBILE is set to false
let update_shown_headlines = () => {

    let headlines_to_show = ALL_HEADLINES.filter(h => h.is_show);
    if (IS_MOBILE) {
        for (let x = 0; x < headlines_to_show.length; x++) {
            if ((x + 1) < headlines_to_show.length)
                headlines_to_show[x].next = headlines_to_show[x + 1];
            if ((x - 1) >= 0)
                headlines_to_show[x].previous = headlines_to_show[x - 1];
        }

        headlines_to_show.map(h => h.set_out_of_view());
    }

    div_all_headlines = document.getElementById("headlines_container_divs")
    clear_headlines();

    for (let headline of ALL_HEADLINES) {
        if (headline.is_show) {
            // CAROUSEL.addItem(headline.div);
            div_all_headlines.appendChild(headline.div);
        }
    }

    if (!IS_MOBILE) {
        PAGES = headlines_to_pages();
        adjust_pagination();
        switch_to_page(1);
    }

    if (ALL_HEADLINES.filter(h => h.is_show).length == 0) {
        if (IS_MOBILE) {
            div_all_headlines.appendChild(fill_nothing_found_template(MOBILE_NOTHING_FOUND));
            // CAROUSEL.addItem(fill_nothing_found_template(MOBILE_NOTHING_FOUND));
        } else {
            div_all_headlines.appendChild(fill_nothing_found_template(DESKTOP_NOTHING_FOUND));
            // CAROUSEL.addItem(fill_nothing_found_template(DESKTOP_NOTHING_FOUND));
        }
        return;
    } else {
        if (IS_MOBILE) {
            headlines_to_show[0].center();
        }
    }

    if (!IS_MOBILE)
        document.getElementById("headlines_container").scrollTo(0, 0);
}

// Applies the filters 
// Sets the is_show parameter for each Headline object in ALL_HEADLINES
// @param   {string}    search_string       The search string, can be null if not required
let apply_filters = (search_string) => {
    allowed_source_names = Object.keys(NEWS_SOURCES).filter(key => NEWS_SOURCES[key].selected).map(key => NEWS_SOURCES[key].name)
    for (let headline of ALL_HEADLINES) {
        if (headline.search_self(allowed_source_names, search_string)) {
            headline.show()
        } else {
            headline.hide()
        }
    }
}

// Split the headlines which have the is_show attribute set to true into pages
// @return  {json}                          The pages as a json object where pages[1] is the first page
let headlines_to_pages = () => {
    let i = 0
    pages = {}
    page_nr = 0
    const headlines_to_show = ALL_HEADLINES.filter(h => h.is_show);
    while (i < headlines_to_show.length) {
        if (i % 20 == 0) {
            page_nr++;
            pages[page_nr + ""] = []
        }
        pages[page_nr + ""].push(headlines_to_show[i])
        i++;
    }
    return pages
}

// Adjust pagination based on the global PAGES json variable
let adjust_pagination = () => {
    pagination_start = document.getElementById("pagination-start")

    while (pagination_start.nextElementSibling.className === "page-item") {
        pagination_start.parentElement.removeChild(pagination_start.nextElementSibling)
    }

    for (let page_nr = Object.keys(PAGES).length; page_nr >= 1; page_nr--) {
        insertAfter(fill_page_switch_template(page_nr), pagination_start)
    }
}

// Switch to a page number, using the global PAGES json variable
// @return  {integer}   page_nr             The page number 
let switch_to_page = (page_nr) => {
    if (page_nr > Object.keys(PAGES).length | page_nr < 1)
        return

    clear_headlines()

    if (SELECTED_PAGINATION_DIV)
        SELECTED_PAGINATION_DIV.classList.remove("selected")

    SELECTED_PAGINATION_DIV = document.getElementById("page-nr-" + page_nr)
    SELECTED_PAGINATION_DIV.classList.add("selected")

    CURRENT_PAGE = page_nr
    show_headlines(PAGES[page_nr])

    document.getElementById("headlines_container").scrollTo(0, 0);
}

// Clear all shown headlines
let clear_headlines = () => {
    let div_headlines = document.getElementById("headlines_container_divs");
    div_headlines.clearChildren();
}

// Show headlines 
// @param  {[Headline]} selected_headlines  The headline to be shown
let show_headlines = (selected_headlines) => {
    clear_headlines();
    let div_headlines = document.getElementById("headlines_container_divs");
    for (let headline of selected_headlines) {
        div_headlines.appendChild(headline.div);
    }
}

// --------------------------------------------------------------------------------------------------
// Headline Class
// --------------------------------------------------------------------------------------------------

class Headline {
    // Creates a new headline element from a json object containing the data.
    // Generates the dom element, onclick / ontouch listener
    constructor(topnews_data) {
        this.title = topnews_data.title;

        try {
            // Parse date & save date and formatted string
            this.published_dt = new Date(Date.parse(topnews_data.published))
            this.published = this.published_dt.toLocaleString();
        } catch {
            // Leave as default string, set date attribute to null
            // Will still allow sorting, but move to the back
            this.published = topnews_data.published;
            this.published_dt = null;
        }

        this.link = topnews_data.link;
        this.source = topnews_data.source;
        this.key = topnews_data.key;
        this.summary = replace_href_target(replace_http(topnews_data.summary));

        this.geolocations = topnews_data.geolocations;
        this._sanitize_geolocation_names();

        // Whether the Headline is to be shown on the next headline update call
        this.is_show = true;

        // Whether the Headline is expanded, e.g. the content is shown
        this.is_expanded = false;

        // Whether the Headline is currently in focus
        this.is_focus = false;

        this._make_div();
        this._add_onclick_listeners();

         if (IS_MOBILE)
             this._add_touch_listeners();
        // this._add_onswipe_listener();
    }

    // Sanitizes the geolocation names according to the global JSON with information about unified 
    // Country names
    _sanitize_geolocation_names() {
        for (let geolocation of this.geolocations) {
            if (geolocation.name in SANE_COUNTRY_NAMES) {
                // console.log("replacing", geolocation.name, "with", SANE_COUNTRY_NAMES[geolocation.name]);
                geolocation.name = SANE_COUNTRY_NAMES[geolocation.name];
            }
        }
    }

    // Create the headline dom element from the template
    // Uses title, summary, surce and published (publish-date) as inputs.
    _make_div() {
        this.div = fill_headline_template(this);
        this.div.jsobj = this;
        this.div_card = this.div.querySelector(".headline-card");
        this.div_content = this.div.querySelector(".headline-content")

        let dom_badges = this.div.querySelector(".headline-badges")
        for (let geolocation of this.geolocations) {
            let badge;
            if (geolocation.type == "point") {
                badge = div_from_template("<span class='badge badge-info badge-point'></span>");
            } else if (geolocation.type == "country") {
                badge = div_from_template("<span class='badge badge-info badge-country'></span>");
            } else {
                continue;
            }
            badge.textContent = geolocation.name;
            badge.onclick = (event) => {
                // if (this.is_focus)
                // event.stopPropagation();
                event.stopPropagation();
                MAP.setCenterAnimated(new mapkit.Coordinate(geolocation.lat, geolocation.lng), false);
            }
            dom_badges.appendChild(badge)
        }
    }

    _add_touch_listeners() {
        this.div.style.transform = `translateX(${screen.width}px)`

        let headlines_container = document.querySelector('#headlines_container');
        let headlines_container_divs = document.querySelector("#headlines_container_divs")
        this.div.ontouchstart = (event) => {


            // let max_height = Math.min(this.next ? this.next.div_card.offsetHeight : 999999, this.previous ? this.previous.div_card.offsetHeight : 999999)
            // max_height = Math.min(max_height, this.div_card.offsetHeight)

            // headlines_container_divs.style.height = max_height + 10 + "px";
            
            headlines_container_divs.style.height = "100%";
            headlines_container.style.height = "100%";

            this._set_smooth(false);

            if (this.next)
                this.next._set_smooth(false);

            if (this.previous)
                this.previous._set_smooth(false);

            this.startX = event.touches[0].clientX;
            this.startY = event.touches[0].clientY;
        }

        this.div.ontouchmove = (event) => {
            if (!this.startX)
                this.startX = event.touches[0].clientX;

            if (!this.startY)
                this.startY = event.touches[0].clientY;


            let deltaX = event.touches[0].clientX - this.startX;
            let deltaY = event.touches[0].clientY - this.startY;

            // On swipe up, dont scroll right and left
            if (Math.abs(deltaX) < Math.abs(deltaY) && Math.abs(deltaY) > 3) {
                if(this.set)
                    return
                else {
                    this.set = true;
                    headlines_container.style.height = this.div_card.offsetHeight + 10 + "px";
                    headlines_container_divs.style.height = this.div_card.offsetHeight + 10 + "px";
                    return;
                }
                return;
            }

            // So you can' scroll up anymore
            event.preventDefault();

            this.div.style.transform = `translateX(${deltaX}px)`;

            if (this.previous)
                this.previous._trace(-screen.width + deltaX);

            if (this.next)
                this.next._trace(+screen.width + deltaX);

        }
        this.div.ontouchend = (event) => {
            this._set_smooth(true);

            let delta = event.changedTouches[0].clientX - this.startX;
            let transaction_threshold_reached = Math.abs(delta) > screen.width * 0.5;

            if (!transaction_threshold_reached)
                return this.center();

            if (delta < 0) {
                if (this.next)
                    this.next.center()
                else
                    this.center()
            } else if (delta > 0) {
                if (this.previous)
                    this.previous.center()
                else
                    this.center()
            }
        }
    }

    set_out_of_view() {
        this._move(screen.width, false);
    }

    center(smooth = true, show_markers = true) {

        if (this.next)
            this.next._move(screen.width, smooth);

        if (this.previous)
            this.previous._move(-screen.width, smooth);

        this._move(0, smooth);

        setTimeout(() => {
            this._adapt_container();
        }, 300);

        if (show_markers)
            this.show_markers(true)

        // ALL_HEADLINES.map(h => {
        //     h.set_out_of_view("out-of-view");
        // })

        // this.set_in_view()

    }
    _trace(x) {
        this.div.style.transform = `translateX(${x}px)`;
    }
    _move(x, smooth = true) {
        if (smooth)
            this.div.classList.add("smooth");
        else
            this.div.classList.remove("smooth");

        this.div.style.transform = `translateX(${x}px)`;
    }

    _set_smooth(bool) {
        if (bool)
            this.div.classList.add("smooth");
        else
            this.div.classList.remove("smooth");
    }

    // Adds an onclick listener to the headline card
    // On touch / click, the headline is expanded and the markers shown
    _add_onclick_listeners() {
        this.div.onclick = async (event) => {
            this.focus();
            this.expand();
            this.show_markers(true);
            console.log("expand")
        };

        this.div.querySelector(".close").onclick = (event) => {
            // Otherwise the listener just above is triggered
            event.stopPropagation();

            this.minimize();
            // If on desktop, remove the markers from the map
            if (!IS_MOBILE)
                clear_map();
        }
    }

    _adapt_container() {
        let headlines_container = document.querySelector('#headlines_container');
        headlines_container.style.height = this.div_card.offsetHeight + 10 + "px";
        document.querySelector("#headlines_container_divs").style.height = this.div_card.offsetHeight + 10 + "px";
    }

    // DEPRECATED
    // _add_onswipe_listener() {
    //  //this.div.addEventListener('touchstart', handleTouchStart, false);
    //  //this.div.addEventListener('touchmove', handleTouchMove, false);
    //  var xDown = null;
    //  var yDown = null;
    //  this.div.ontouchstart = (evt) => {
    //      const firstTouch = evt.touches[0];
    //      xDown = firstTouch.clientX;
    //      yDown = firstTouch.clientY;
    //  }
    //  this.div.ontouchmove = (evt) => {
    //      if (!xDown || !yDown) {
    //          return;
    //      }
    //      var xUp = evt.touches[0].clientX;
    //      var yUp = evt.touches[0].clientY;
    //      var xDiff = xDown - xUp;
    //      var yDiff = yDown - yUp;
    //      if (Math.abs(xDiff) > Math.abs(yDiff)) { /*most significant*/
    //          if (xDiff > 0) {
    //              /* left swipe */
    //              // console.log("left swipe");
    //          } else {
    //              /* right swipe */
    //              // console.log("right swipe");
    //          }
    //      } else {
    //          console.log(Math.abs(yDiff) / this.div.offsetHeight)
    //          if (Math.abs(yDiff) / this.div.offsetHeight > 0.1) {
    //              if (yDiff > 0) {
    //                  // console.log("up swipe");
    //              } else {
    //                  console.log("down swipe");
    //                  this.remove_from_view()
    //              }
    //          }
    //      }
    //      /* reset values */
    //      xDown = null;
    //      yDown = null;
    //  };
    // }

    // Focus on this headline, adding an orange glow
    focus() {
        ALL_HEADLINES.map(h => h.unfocus());
        this.is_focus = true;
        this.div.classList.add("focus");
    }

    // Unfocus the headline
    unfocus() {
        this.is_focus = false;
        this.div.classList.remove("focus");
    }

    // Return the height of the headline card
    // @return {float}                          The height of the card itself (.headline-card)
    get_height() {
        return this.div_card.offsetHeight;
    }

    // DEPRECATED
    // Resets the headline's state to it's notated state (can be called to reverse it if the dom was mutated
    // directly by calling expand or minimize with no_set = true)
    // @param   {bool}      instant             If true, the object is shown immediatly, skipping any animations
    // reset_from_state(instant) {
    //  if (this.is_expanded)
    //      this.expand(true, instant);
    //  else
    //      this.minimize(true, instant);
    // }

    // Expands the headline
    // @param   {bool}      no_set              Whether to make this change persistent. If set to no, the object 
    //                                          can be reversed to its original state with reverse_from_state()
    expand(no_set) {
        if (IS_MOBILE) {
            this.div_content.style.maxHeight = "55vh";

            let headlines_container = document.querySelector('#headlines_container');
            headlines_container.style.height = "100%";

            setTimeout(() => {
                this._adapt_container();
            }, 300);

        }
        this.div.classList.add("showing");

        if (!no_set)
            this.is_expanded = true;
    }

    // Minimizes the headline
    // @param   {bool}      no_set              Whether to make this change persistent. If set to no, the object 
    //                                          can be reversed to its original state with reverse_from_state()
    minimize(no_set) {
        if (IS_MOBILE) {
            this.div_content.style.maxHeight = "0px";

            setTimeout(() => {
                this._adapt_container();
            }, 400);
        }
        this.div.classList.remove("showing");
        if (!no_set)
            this.is_expanded = false;
    }

    // Show's the headlines markers on the map
    // Removes all other markers from the map
    async show_markers(truefocus) {
        if (this.markers_shown)
            return;

        ALL_HEADLINES.map(h => h.markers_shown = false);
        this.markers_shown = true;

        clear_map();
        let lls = []
        for (let ll of this.geolocations) {
            if (ll != null && ll.type != "country") {
                let coordinate = new mapkit.Coordinate(ll.lat, ll.lng)
                // lls.push(new mapkit.MarkerAnnotation(coordinate, { color: "#f4a56d", glyphText: "" + ll.count }))
                lls.push(new mapkit.MarkerAnnotation(coordinate, {
                    color: "#f4a56d",
                    subtitle: ll.name,
                    subtitleVisibility: mapkit.FeatureVisibility.Visible,
                    // glyphText: ll.name
                    glyphText: ll.count + ""
                }))
            }
        }
        MAP.showItems(lls);

        if (focus)
            this.focus_on_map();

        setTimeout(() => {
            for (let ll of this.geolocations) {
                if (ll != null && ll.type === "country") {
                    // console.log(ll.name, "to", unified_name);
                    let async_closure = async () => {
                        let unified_name = ll.name.toUpperCase().replace(/ /g, "_");
                        let country_shapefile = await get_shapefile_wcache(unified_name);
                        if (country_shapefile) {
                            let polygons = make_polygons(country_shapefile);
                            MAP.addOverlays(polygons);
                        }
                    }
                    async_closure();
                }
            }
        }, 100);
    }

    focus_on_map() {
        let center = get_lat_lng_center(expand_geolocations(this.geolocations));
        // MAP.setCenterAnimated(new mapkit.Coordinate(center[0], center[1]));
        map.cameraZoomRange = new mapkit.CameraZoomRange(2000000, 999999999999);
        MAP.setCenterAnimated(new mapkit.Coordinate(center[0], center[1]), false);
        map.cameraZoomRange = new mapkit.CameraZoomRange(0, 999999999999);
    }

    // Set the headline to be shown.
    // Does not update the view, call update_shown_headlines() to update.
    show() {
        this.is_show = true;
    }

    // Set the headline to be hidden.
    // Does not update the view, call update_shown_headlines() to update.
    hide() {
        this.is_show = false;
    }

    // Searches the headline 
    // @param   {array}     allowed_sources     An Array of allowed news sources 
    // @param   {type}      re_search_string    The search query (can be regex or just standard text) 
    // 
    // @return  {bool}      found               Whether the this headline corresponds to the query & allowed sources
    search_self(allowed_sources, re_search_string) {

        // Check if the source is allowed
        if (!allowed_sources.includes(this.source))
            return false;

        // Check if there is a search string
        // console.log("Search string null", re_search_string == null)
        if (re_search_string == null)
            return true

        // Check if the search string is in the title
        // console.log("Search string in title", this.title.toLowerCase().search(re_search_string.toLowerCase()) != -1);
        if (this.title.toLowerCase().search(re_search_string.toLowerCase()) != -1)
            return true;

        // Check if the search string is in the summary
        // console.log("Search string in summary", this.summary.toLowerCase().search(re_search_string.toLowerCase()) != -1);
        if (this.summary.toLowerCase().search(re_search_string.toLowerCase()) != -1)
            return true;

        // Check if the search string is in the geolocations
        const geolocations_flat = this.geolocations.map(g => g.name).join(" ");
        // console.log("Search string in geolocations", geolocations_flat.toLowerCase().search(re_search_string.toLowerCase()) != -1);
        if (geolocations_flat.toLowerCase().search(re_search_string.toLowerCase()) != -1)
            return true;

        return false;
    }

}

// --------------------------------------------------------------------------------------------------
// Fetching data
// --------------------------------------------------------------------------------------------------

// Show headlines 
// @return  {Promise() => json}             The news data as a json object
let get_headlines = async () => {
    return fetch("https://mapnews.menzinger.workers.dev/topnews" + _DEV)
        .then(response => response.json())
        .then(result => {
            return result
        })
}

// Fetches a shapefile with a given name
// @param   {String}    name                The name of the shapefile
// @return  {Promise() => json}             The news data as a json object
let get_shapefile = async (name) => {
    try {
        return fetch("../countryshapes/" + name + ".js")
            .then(response => response.json())
            .then(result => {
                return result
            })
    } catch {
        return null;
    }
}

let report_ref = () => {
    fetch("https://mapnews.menzinger.workers.dev/ref" + _DEV, {
        method: 'POST',
        body: JSON.stringify(document.referrer)
    });
}

// --------------------------------------------------------------------------------------------------
// Template fillers
// --------------------------------------------------------------------------------------------------

// Fills the template with the selected message. Used when there's no search results
// Fill the page switcher element template with a page number 
// @param   {string}        nothing_found_message       The message
// @return  {dom element}                               The dom element
let fill_nothing_found_template = (nothing_found_message) => {
    let template = `
    <div class="headline">
        <div class="card shadow-sm headline-card">
            <div class="card-body headline-card-body">
                <div class="headline-title">
                    There's nothing here, sorry!
                </div>
                ${nothing_found_message}
            </div>
        </div>
    </div>
    `;
    return div_from_template(template);
}

// Fill the page switcher element template with a page number 
// @param   {int}           page_nr                     The number of the page
// @return  {dom element}   The dom element
let fill_page_switch_template = (page_nr) => {
    const page_switcher_template = `
            <li class="page-item">
                <a class="page-link" id="page-nr-${page_nr}" href="#" onclick=switch_to_page(${page_nr})>${page_nr}</a>
            </li>
        `
    return div_from_template(page_switcher_template);
}

// Fill the headline template with data
// @param   {Headline}      headline        The number of the page
// @return  {dom element}                   The dom element
let fill_headline_template = (headline) => {
    const headline_template = `
            <div class="headline">
                <div class="card shadow-sm headline-card">
                    <div class="card-body headline-card-body">
                        <div class="headline-title">
                            ${headline.title}
                        </div>
                        <button type="button" class="close" aria-label="Close">
                            <span aria-hidden="true">&times;</span>
                        </button>
                        <div class="headline-badges">
                        </div>
                        <div class="headline-content">
                            ${headline.summary}
                            <br>
                            <a target="_blank" rel="noopener noreferrer" href="${headline.link}">Read More</a>
                        </div>
                        <div class="headline-info">
                            <div class="headline-source">
                                ${headline.source}
                            </div>
                            <div class="headline-date">
                                ${headline.published}
                            </div>
                        <div>
                    </div>
                </div>
            </div>
        `;
    return div_from_template(headline_template);
}


// Fetches the shapefile with the given name via HTTP or the cache
// @param   {String}    name        The country's name
let get_shapefile_wcache = async (name) => {
    if (name in SHAPEFILE_CACHE) {
        // console.log("Serving Shapefile from Cache")
        return SHAPEFILE_CACHE[name];
    } else {
        SHAPEFILE_CACHE[name] = await get_shapefile(name);
        return SHAPEFILE_CACHE[name];
    }
}


// --------------------------------------------------------------------------------------------------
// Polyfills & Helpers.
// --------------------------------------------------------------------------------------------------

// Clears the map of all overlays and annotations
let clear_map = () => {
    if (MAP) {
        MAP.removeAnnotations(MAP.annotations)
        MAP.removeOverlays(MAP.overlays)
    }
}

// CAREFUL: Lat lng are reversed in country shapefiles
let make_polygons = (country_pts) => {
    let polygons = [];
    for (let pts of country_pts) {
        polygons.push(make_polygon(pts[0]));
    }
    return polygons;
}


// CAREFUL: Lat lng are reversed in country shapefiles
let make_polygon = (points) => {
    points = points.map(point => new mapkit.Coordinate(point[1], point[0]));
    var style = new mapkit.Style({
        strokeColor: "#f4a56d",
        strokeOpacity: .4,
        fillColor: "#f4a56d",
        fillOpacity: .3,
        lineWidth: 2,
        lineJoin: "round",
        // lineDash: [2, 2, 6, 2, 6, 2]
    });

    return new mapkit.PolygonOverlay([points], { style: style });
}

// Converts radians to degrees
// @param {float}   radians     The angle in radians 
// @return {float}              The angle in degrees
let rad_to_deg = (radians) => {
    return radians * 180 / Math.PI;
}

// Converts degrees to radians
// @param {float}   degrees     The angle in degree
// @return {float}              The angle in radians
let deg_to_rad = (degrees) => {
    return degrees * Math.PI / 180;
}


// Expands an array of geolocations by the "count" attribute
// E.g. if UK has count 6 -> returns UK six times in the array
// @param {[geolocations]}      geolocations    The geolocations to be expanded
// @return {[{geolocations}]}                   The expanded geolocations
let expand_geolocations = (geolocations) => {
    let expanded_geolocations = []
    for (let geolocation of geolocations) {
        let exp_geo = Array.apply(null, Array(geolocation.count)).map(_ => geolocation);
        expanded_geolocations.push(...exp_geo);
    }
    return expanded_geolocations;
}

// https://stackoverflow.com/questions/6671183/calculate-the-center-point-of-multiple-latitude-longitude-coordinate-pairs
// @param [{"lat": .., "lng": ...}] geolocations    The array of lat_lng objects
// @return {[lat, lng]}                             The calculated centerpoint  
let get_lat_lng_center = (geolocations) => {
    let sumX = 0;
    let sumY = 0;
    let sumZ = 0;

    for (let geolocation of geolocations) {
        let lat = deg_to_rad(geolocation["lat"]);
        let lng = deg_to_rad(geolocation["lng"]);
        // sum of cartesian coordinates
        sumX += Math.cos(lat) * Math.cos(lng);
        sumY += Math.cos(lat) * Math.sin(lng);
        sumZ += Math.sin(lat);
    }

    let avgX = sumX / geolocations.length;
    let avgY = sumY / geolocations.length;
    let avgZ = sumZ / geolocations.length;

    // convert average x, y, z coordinate to latitude and longtitude
    let lng = Math.atan2(avgY, avgX);
    let hyp = Math.sqrt(avgX * avgX + avgY * avgY);
    let lat = Math.atan2(avgZ, hyp);

    return ([rad_to_deg(lat), rad_to_deg(lng)]);
}

// Replaces all unsafe links with https:// links. 
// Works for these sources, otherwise probaby not a good idea
// @param   {string}        inner_html_string       The html content with unsafe links
// @return  {string}        inner_html_string       The html content with safe links
let replace_http = (inner_html_string) => {
    return inner_html_string.replace(/http:\/\//g, 'https:\/\/');
}

// Replaces all a links to open in a new tab. 
// Works for these sources, otherwise probaby not a good idea
// @param   {string}        inner_html_string       The html content with mixed links
// @return  {string}        inner_html_string       The html content with new tab links
let replace_href_target = (inner_html_string) => {
    return inner_html_string.replace(/<a/g, '<a target="_blank" rel="noopener noreferrer"');
}


// Returns a dom element from a filled template string
// @param   {filled_template_string}    search_string       The search string, can be null if not required
// @return  {dom element}                                   The dom element
let div_from_template = (filled_template_string) => {
    let wrapper = document.createElement("div");
    wrapper.innerHTML = filled_template_string;
    return wrapper.firstElementChild;
}

// https://stackoverflow.com/questions/3955229/remove-all-child-elements-of-a-dom-node-in-javascript
// Removes all children of an element
if (typeof Element.prototype.clearChildren === 'undefined') {
    Object.defineProperty(Element.prototype, 'clearChildren', {
        configurable: true,
        enumerable: false,
        value: function() {
            while (this.firstChild) this.removeChild(this.lastChild);
        }
    });
}

// https://stackoverflow.com/questions/4793604/how-to-insert-an-element-after-another-element-in-javascript-without-using-a-lib
// Inserts a dom element after the other
// @param   {node}      new_node            The node to insert
// @param   {node}      new_node            The reference node
let insertAfter = (new_node, reference_node) => {
    reference_node.parentNode.insertBefore(new_node,
        reference_node.nextSibling);
}