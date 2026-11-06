import { Component, CUSTOM_ELEMENTS_SCHEMA, OnInit, inject, signal } from '@angular/core';
import { FeatLoader } from './feat-loader';

@Component({
  imports: [],
  // <deploy-info> is a feat feature (custom element) Angular knows nothing about
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App implements OnInit {
  private readonly feat = inject(FeatLoader);

  /** The versioned URL the loader actually resolved — shown on the page. */
  protected readonly featureUrl = signal('loading…');

  ngOnInit(): void {
    this.feat
      .load('version-display', 'js-web')
      .then((url) => this.featureUrl.set(url))
      .catch((err) => this.featureUrl.set(String(err)));
  }
}
