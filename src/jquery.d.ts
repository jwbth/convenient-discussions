import 'jquery';

declare module 'jquery' {
  namespace JQueryStatic {
    function cdMerge(...arrayOfJquery: Array<JQuery|undefined>): this;
  }
}

export {};
