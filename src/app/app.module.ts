import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppComponent } from './app.component';
import { CanvasComponent } from './components/canvas/canvas.component';
import { CoordinateService } from './services/coordinate.service';
import { FormsModule } from '@angular/forms';

@NgModule({
  declarations: [AppComponent, CanvasComponent],
  imports: [BrowserModule, FormsModule],
  providers: [CoordinateService],
  bootstrap: [AppComponent],
})
export class AppModule {}
